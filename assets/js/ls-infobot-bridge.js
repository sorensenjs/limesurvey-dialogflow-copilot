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

    // Log all incoming responses from CES
    window.addEventListener('chat-messenger-response-received', (e) => {
      console.log('[LimeSurvey Co-Pilot] Raw response received from CES:', e.detail);
    });

    window.addEventListener('chat-messenger-error', (e) => {
      console.warn('[LimeSurvey Co-Pilot] chat-messenger-error event:', e.detail);
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

    const tools = {
      ls_get_page_questions: () => {
        console.log('[LimeSurvey Co-Pilot] ls_get_page_questions invoked');
        const questions = [];
        document.querySelectorAll('.question-container').forEach((el) => {
          let code = el.getAttribute('data-code');
          if (!code) {
            // Check for <!-- Question CODE -->
            const match = el.innerHTML.match(/<!--\s*Question\s+([A-Za-z0-9_]+)\s*-->/i);
            if (match && match[1] !== 'count' && match[1] !== 'text') {
              code = match[1];
            }
          }
          if (!code) {
            code = el.id.replace('question', '');
          }
          el.setAttribute('data-code', code);

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

        const result = {
          surveyId: config.surveyContext.surveyId,
          pageQuestions: questions,
        };
        console.log('[LimeSurvey Co-Pilot] ls_get_page_questions returning:', result);
        return Promise.resolve(result);
      },

      ls_answer_question: (params) => {
        console.log('[LimeSurvey Co-Pilot] ls_answer_question invoked with params:', params);
        const { questionCode, value, optionCode } = params || {};
        const qContainer = findQuestionContainer(questionCode);

        if (!qContainer) {
          const err = `Question ${questionCode} not found`;
          console.warn('[LimeSurvey Co-Pilot] ' + err);
          return Promise.resolve({ success: false, error: err });
        }

        let answered = false;

        // Case A: Radio / Single Choice
        if (optionCode || value) {
          const targetVal = String(optionCode || value).trim();
          let radio = qContainer.querySelector(`input[type="radio"][value="${targetVal}"]`);
          if (!radio) {
            qContainer.querySelectorAll('input[type="radio"]').forEach((r) => {
              if (r.value.toLowerCase() === targetVal.toLowerCase()) {
                radio = r;
              }
            });
          }
          if (radio) {
            radio.checked = true;
            radio.click();
            triggerEvents(radio);
            answered = true;
          }
        }

        // Case B: Checkbox / Multi Choice
        if (!answered && (optionCode || value)) {
          const targetVal = String(optionCode || value).trim();
          let checkbox = qContainer.querySelector(`input[type="checkbox"][value="${targetVal}"]`);
          if (!checkbox) {
            qContainer.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
              if (cb.value.toLowerCase() === targetVal.toLowerCase()) {
                checkbox = cb;
              }
            });
          }
          if (checkbox) {
            checkbox.checked = true;
            checkbox.click();
            triggerEvents(checkbox);
            answered = true;
          }
        }

        // Case C: Dropdown / Select
        if (!answered) {
          const select = qContainer.querySelector('select');
          if (select) {
            const targetVal = String(optionCode || value).trim();
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

        const res = {
          success: answered,
          questionCode,
          message: answered ? 'Answer updated in LimeSurvey' : 'Could not match input field',
        };
        console.log('[LimeSurvey Co-Pilot] ls_answer_question returning:', res);
        return Promise.resolve(res);
      },

      ls_highlight_question: (params) => {
        console.log('[LimeSurvey Co-Pilot] ls_highlight_question invoked with params:', params);
        const { questionCode } = params || {};
        const qContainer = findQuestionContainer(questionCode);
        if (qContainer) {
          qContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
          qContainer.classList.add('ls-copilot-highlight');
          setTimeout(() => qContainer.classList.remove('ls-copilot-highlight'), 3000);
          return Promise.resolve({ success: true });
        }
        return Promise.resolve({ success: false, error: 'Question not found' });
      },

      ls_advance_page: () => {
        console.log('[LimeSurvey Co-Pilot] ls_advance_page invoked');
        const submitBtn = document.getElementById('ls-button-submit');
        if (submitBtn) {
          submitBtn.click();
          return Promise.resolve({ success: true, action: 'page_submitted' });
        }
        return Promise.resolve({ success: false, error: 'Submit button not found' });
      }
    };

    const UUID_MAP = {
      '7812b627-900a-4705-a78b-9937af6bd5ac': 'ls_get_page_questions',
      '14546102-fdeb-4ecc-9fc3-f951b041c424': 'ls_answer_question',
      '73ec0529-43dc-4f95-837a-91ccc64632e9': 'ls_highlight_question',
      '7005cd31-896d-4003-94ee-77ff55120f25': 'ls_advance_page',
    };

    // Register with messenger under multiple variations to guarantee matching
    for (const [actionName, fn] of Object.entries(tools)) {
      // 1. Standard registration: limesurvey_copilot.action
      messenger.registerClientSideFunction(TOOL_NAME, actionName, fn);

      // 2. Global registration across all tools: action
      if (messenger.presenter && typeof messenger.presenter.registerClientSideFunctionForAllTools === 'function') {
        messenger.presenter.registerClientSideFunctionForAllTools(actionName, fn);
      }
      if (messenger.presenter && messenger.presenter.ha && messenger.presenter.ha.l) {
        messenger.presenter.ha.l.set(actionName, fn);
      }
    }

    // Also register explicitly for each UUID
    for (const [uuid, name] of Object.entries(UUID_MAP)) {
      const fn = tools[name];
      messenger.registerClientSideFunction(uuid, uuid, fn);
      if (messenger.presenter && messenger.presenter.ha) {
        messenger.presenter.ha.register(uuid, uuid, fn);
        messenger.presenter.ha.l.set(uuid, fn);
      }
    }

    // 3. Monkey-patch presenter.ha.execute to log every single tool call and intercept if unmapped
    if (messenger.presenter && messenger.presenter.ha && typeof messenger.presenter.ha.execute === 'function') {
      const origExecute = messenger.presenter.ha.execute.bind(messenger.presenter.ha);
      messenger.presenter.ha.execute = function(tool, action, args, d, cesToolCallId) {
        console.log('[LimeSurvey Co-Pilot] -> Incoming Client-Side Function Call:', {
          tool,
          action,
          args,
          cesToolCallId
        });

        // Resolve action name from UUID or direct name
        const cleanAction = action ? action.split('/').pop() : '';
        const toolFunc = UUID_MAP[cleanAction] || cleanAction;
        const fn = tools[toolFunc] || tools[cleanAction];

        if (fn) {
          console.log(`[LimeSurvey Co-Pilot] Resolved action "${cleanAction}" -> function "${toolFunc}"`);
          messenger.presenter.ha.l.set(action, fn);
          messenger.presenter.ha.l.set(cleanAction, fn);
          messenger.presenter.ha.register(tool, action, fn);
        } else {
          console.warn(`[LimeSurvey Co-Pilot] No matching function found for action "${action}"`);
        }

        return origExecute(tool, action, args, d, cesToolCallId);
      };
    }
  }

  // --- Helper Utilities ---

  function findQuestionContainer(questionCode) {
    if (!questionCode) return null;
    const strCode = String(questionCode).trim();

    // 1. Match by data-code
    let container = document.querySelector(`.question-container[data-code="${strCode}" i]`);
    if (container) return container;

    // 2. Match by id="questionX"
    container = document.getElementById(`question${strCode}`) || document.getElementById(strCode);
    if (container && container.classList.contains('question-container')) return container;

    // 3. Match by HTML comment or contained input names
    for (const el of document.querySelectorAll('.question-container')) {
      const match = el.innerHTML.match(/<!--\s*Question\s+([A-Za-z0-9_]+)\s*-->/i);
      if (match && (match[1].toLowerCase() === strCode.toLowerCase() || el.id.replace('question', '') === strCode)) {
        return el;
      }
      if (el.id.replace('question', '') === strCode) {
        return el;
      }
      if (el.querySelector(`[name*="${strCode}" i]`)) {
        return el;
      }
    }

    return null;
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
    if (typeof window.checkconditions === 'function' && el.name) {
      try {
        window.checkconditions(el.value, el.name, el.type);
      } catch (e) {
        console.warn('[LimeSurvey Co-Pilot] checkconditions warning:', e);
      }
    }
  }
})();
