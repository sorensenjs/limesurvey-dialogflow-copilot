(function () {
  'use strict';

  if (!window.LS_DIALOGFLOW_CONFIG) return;
  const config = window.LS_DIALOGFLOW_CONFIG;

  function initCoPilot() {
    if (!window.chatSdk || !window.chatSdk.prebuilts) {
      setTimeout(initCoPilot, 50);
      return;
    }

    console.log('[LimeSurvey Co-Pilot] chatSdk loaded. Registering context and mounting widget...');

    // 1. Install utilities
    if (typeof globalThis.dfInstallUtils === 'function') {
      try {
        globalThis.dfInstallUtils({
          'markdown-fixer': {},
        });
      } catch (e) {
        console.warn('[LimeSurvey Co-Pilot] dfInstallUtils warning:', e);
      }
    }

    // 2. Register Context with Server-Side Token Broker
    window.chatSdk.registerContext(
      window.chatSdk.prebuilts.ces.createContext({
        deploymentName: config.deploymentName,
        tokenBroker: {
          enableTokenBroker: true,
          customTokenResolver: async () => {
            console.log('[LimeSurvey Co-Pilot] Requesting ephemeral OAuth2 token from LimeSurvey broker...');
            const resp = await fetch(config.tokenEndpoint, {
              headers: { 'X-Requested-With': 'XMLHttpRequest' },
            });
            if (!resp.ok) {
              const err = await resp.text();
              console.error('[LimeSurvey Co-Pilot] Token broker error:', err);
              throw new Error('Failed to fetch OAuth2 token from LimeSurvey broker');
            }
            const data = await resp.json();
            console.log('[LimeSurvey Co-Pilot] Token successfully received!');
            return {
              accessToken: data.accessToken,
              expireTime: data.expiresAt * 1000,
            };
          },
        },
      })
    );

    // 3. Mount Widget
    mountCoPilotWidget();
  }

  // Start initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCoPilot);
  } else {
    initCoPilot();
  }

  function mountCoPilotWidget() {
    const messenger = document.createElement('chat-messenger');
    messenger.setAttribute('language-code', config.surveyContext.language || 'en');
    messenger.setAttribute('session-ttl', '3600');
    messenger.setAttribute('render-mode', config.renderMode || 'slide-over');

    const container = document.createElement('chat-messenger-container');
    container.setAttribute('chat-title', config.chatTitle);
    container.setAttribute('placeholder-text', 'Type your answer or ask for help...');
    container.setAttribute('enable-audio-input', 'true');

    // Titlebar Actions & Bubble Entry Point
    const entryButton = document.createElement('chat-messenger-entry-point-button');
    entryButton.setAttribute('slot', 'entry-point');

    const toggleButton = document.createElement('chat-toggle-dialog-button');
    toggleButton.setAttribute('slot', 'titlebar-actions');

    const resetButton = document.createElement('chat-reset-session-button');
    resetButton.setAttribute('slot', 'titlebar-actions');

    const closeButton = document.createElement('chat-messenger-close-button');
    closeButton.setAttribute('slot', 'titlebar-actions');

    container.appendChild(entryButton);
    container.appendChild(toggleButton);
    container.appendChild(resetButton);
    container.appendChild(closeButton);
    messenger.appendChild(container);

    // Track Session ID in LimeSurvey Form
    window.addEventListener('chat-messenger-session-id-set', (e) => {
      const sessionId = e.detail?.sessionId;
      if (config.sessionTrackingQuestion && sessionId) {
        setInputValueByCode(config.sessionTrackingQuestion, sessionId);
      }
    });

    let functionsRegistered = false;
    function ensureFunctionsRegistered() {
      if (functionsRegistered) return;
      try {
        registerCoPilotFunctions(messenger);
        functionsRegistered = true;
        console.log('[LimeSurvey Co-Pilot] Client-side functions registered successfully.');
      } catch (e) {
        console.warn('[LimeSurvey Co-Pilot] Waiting for presenter before registering functions...', e.message);
      }
    }

    // Register functions once chat-messenger is loaded and presenter is ready
    messenger.addEventListener('chat-messenger-loaded', () => {
      console.log('[LimeSurvey Co-Pilot] chat-messenger-loaded event received.');
      ensureFunctionsRegistered();
    }, { once: true });
    window.addEventListener('chat-messenger-loaded', () => {
      ensureFunctionsRegistered();
    }, { once: true });

    // Auto-Open Drawer if configured
    if (config.autoOpenChat) {
      let drawerOpened = false;
      const openDrawer = () => {
        if (drawerOpened) return;
        setTimeout(() => {
          if (drawerOpened) return;
          if (typeof messenger.slideIn === 'function') {
            console.log('[LimeSurvey Co-Pilot] Opening drawer via slideIn()...');
            messenger.slideIn();
            drawerOpened = true;
          } else if (typeof messenger.openChat === 'function') {
            messenger.openChat();
            drawerOpened = true;
          }
        }, 600);
      };

      messenger.addEventListener('chat-messenger-loaded', openDrawer, { once: true });
      window.addEventListener('chat-messenger-loaded', openDrawer, { once: true });
      setTimeout(openDrawer, 1500);
    }

    // Append to DOM to trigger custom element connection and firstUpdated lifecycle
    document.body.appendChild(messenger);

    // Retries in case events already fired
    setTimeout(ensureFunctionsRegistered, 300);
    setTimeout(ensureFunctionsRegistered, 1000);
    setTimeout(ensureFunctionsRegistered, 2500);
  }

  /**
   * Register Client-Side Functions callable by the Dialogflow Agent
   */
  function registerCoPilotFunctions(messenger) {
    const TOOL_NAME = 'limesurvey_copilot';

    // Tool 1: Get Questions on Active Page
    messenger.registerClientSideFunction(TOOL_NAME, 'ls_get_page_questions', () => {
      const questions = [];
      document.querySelectorAll('.question-container').forEach((el) => {
        const code = el.getAttribute('data-code') || el.id.replace('question', '');
        const textEl = el.querySelector('.question-text, .question-title-container');
        const text = textEl ? textEl.innerText.trim() : '';
        const isMandatory = el.classList.contains('mandatory');

        // Extract options if single-choice or multi-choice
        const options = [];
        el.querySelectorAll('.answer-item, .radio-item, .checkbox-item').forEach((item) => {
          const input = item.querySelector('input[type="radio"], input[type="checkbox"]');
          const label = item.querySelector('label');
          if (input && label) {
            options.push({
              optionCode: input.value,
              label: label.innerText.trim(),
            });
          }
        });

        questions.push({
          code,
          text,
          isMandatory,
          options: options.length > 0 ? options : undefined,
        });
      });

      return Promise.resolve({
        surveyId: config.surveyContext.surveyId,
        pageQuestions: questions,
      });
    });

    // Tool 2: Answer Question (Handles Text, Radio, Checkbox, Dropdown)
    messenger.registerClientSideFunction(TOOL_NAME, 'ls_answer_question', (params) => {
      const { questionCode, value, optionCode } = params;
      const qContainer = findQuestionContainer(questionCode);

      if (!qContainer) {
        return Promise.resolve({ success: false, error: `Question ${questionCode} not found` });
      }

      let answered = false;

      // Case A: Radio / Single Choice
      if (optionCode || value) {
        const targetVal = optionCode || value;
        const radio = qContainer.querySelector(`input[type="radio"][value="${targetVal}"]`);
        if (radio) {
          radio.checked = true;
          triggerEvents(radio);
          answered = true;
        }
      }

      // Case B: Checkbox / Multi Choice
      if (!answered && optionCode) {
        const checkbox = qContainer.querySelector(`input[type="checkbox"][value="${optionCode}"]`);
        if (checkbox) {
          checkbox.checked = true;
          triggerEvents(checkbox);
          answered = true;
        }
      }

      // Case C: Dropdown / Select
      if (!answered) {
        const select = qContainer.querySelector('select');
        if (select) {
          const targetVal = optionCode || value;
          select.value = targetVal;
          triggerEvents(select);
          answered = true;
        }
      }

      // Case D: Text / Textarea / Number
      if (!answered && value !== undefined) {
        const textInput = qContainer.querySelector('input[type="text"], textarea, input[type="number"]');
        if (textInput) {
          textInput.value = value;
          triggerEvents(textInput);
          answered = true;
        }
      }

      return Promise.resolve({
        success: answered,
        questionCode,
        message: answered ? 'Answer updated in LimeSurvey' : 'Could not match input field',
      });
    });

    // Tool 3: Highlight / Scroll to Question
    messenger.registerClientSideFunction(TOOL_NAME, 'ls_highlight_question', (params) => {
      const { questionCode } = params;
      const qContainer = findQuestionContainer(questionCode);
      if (qContainer) {
        qContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
        qContainer.classList.add('ls-copilot-highlight');
        setTimeout(() => qContainer.classList.remove('ls-copilot-highlight'), 3000);
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({ success: false, error: 'Question not found' });
    });

    // Tool 4: Advance Page / Submit
    messenger.registerClientSideFunction(TOOL_NAME, 'ls_advance_page', () => {
      const submitBtn = document.getElementById('ls-button-submit');
      if (submitBtn) {
        submitBtn.click();
        return Promise.resolve({ success: true, action: 'page_submitted' });
      }
      return Promise.resolve({ success: false, error: 'Submit button not found' });
    });
  }

  // --- Helper Utilities ---

  function findQuestionContainer(questionCode) {
    return (
      document.querySelector(`.question-container[data-code="${questionCode}"]`) ||
      document.getElementById(`question${questionCode}`) ||
      document.querySelector(`.question-container[id*="${questionCode}"]`)
    );
  }

  function setInputValueByCode(questionCode, value) {
    const input = document.querySelector(`[name$="${questionCode}"], [name*="X${questionCode}"]`);
    if (input) {
      input.value = value;
      triggerEvents(input);
    }
  }

  function triggerEvents(el) {
    // Both 'input' and 'change' are required for LimeSurvey ExpressionScript
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
})();
