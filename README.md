# Dialogflow Infobot 2 Plugin for LimeSurvey 6

Conversational Co-Pilot integration for LimeSurvey 6 powered by Google Cloud Dialogflow Infobot 2 (`<chat-messenger>` Web SDK).

---

## 1. Directory Layout

```text
DialogflowInfobot/
├── DialogflowInfobot.php          # Main LimeSurvey 6 plugin class
├── config.xml                     # Plugin manifest
├── README.md                      # This setup guide
└── assets/
    ├── js/
    │   ├── chat-messenger.js      # Production bundle (built via Blaze)
    │   └── ls-infobot-bridge.js   # Co-pilot client functions & DOM bindings
    └── css/
        ├── df-messenger-default.css
        ├── chat-messenger-layout.css
        └── ls-infobot-theme.css   # Bootstrap 5 & LimeSurvey styling
```

---

## 2. Building `chat-messenger.js`

To compile the production widget bundle from the Google3 repository:

```bash
/google/bin/releases/arca9-local-blaze-cli/blaze-for-agents build -c opt //cloud/ai/contactcenter/apps/dialogflow_infobot_2:df-messenger
```

Then copy the compiled file to the plugin assets directory:

```bash
cp blaze-bin/cloud/ai/contactcenter/apps/dialogflow_infobot_2/df-messenger.js \
   DialogflowInfobot/assets/js/chat-messenger.js
```

*(Note: Depending on the target configuration, the binary name may be `df-messenger.js` or `chat-messenger.js`.)*

---

## 3. Installation in LimeSurvey 6

1. Copy the `DialogflowInfobot` folder into your LimeSurvey 6 `plugins/` directory:
   ```bash
   cp -r DialogflowInfobot /var/www/html/limesurvey/plugins/
   ```
2. Log in to the **LimeSurvey Admin Panel**.
3. Go to **Configuration > Plugins > Plugin Manager**.
4. Locate **DialogflowInfobot** and click **Activate**.
5. Click **Configure** next to the plugin and paste your **Google Cloud Service Account JSON key**.
   * The Service Account requires the **Dialogflow API Client** or **Dialogflow API User** role (`roles/dialogflow.client`).

---

## 4. Configuring a Survey

1. Open any survey in LimeSurvey 6.
2. Go to **Survey Settings > Dialogflow Assistant**.
3. Set **Enable Conversational Co-Pilot: Yes**.
4. Set **Dialogflow Deployment Name**:
   `projects/<PROJECT_ID>/locations/<LOCATION>/apps/<APP_ID>/deployments/<DEPLOYMENT_ID>`
5. Set **Widget Display Mode**: `Slide-Over Drawer`.
6. (Optional) Enter a Question Code (e.g., `DFSESSION`) to automatically record the Dialogflow `sessionId` with the survey response for auditing.

---

## 5. Configuring the Dialogflow CX Agent

In the **Dialogflow CX Console**:

1. Define a **Client-Side Tool** named `limesurvey_copilot` with the following actions:
   * **`ls_get_page_questions`**:
     * Description: Retrieves all questions, question text, and choice options on the currently visible survey page.
     * Output: `surveyId` (string), `pageQuestions` (list of objects with `code`, `text`, `isMandatory`, `options`).
   * **`ls_answer_question`**:
     * Description: Answers a survey question on the page.
     * Input: `questionCode` (string), `value` (string), `optionCode` (string, optional).
     * Output: `success` (boolean), `message` (string).
   * **`ls_highlight_question`**:
     * Description: Smoothly scrolls to and visually highlights a survey question.
     * Input: `questionCode` (string).
     * Output: `success` (boolean).
   * **`ls_advance_page`**:
     * Description: Validates current page answers and navigates to the next survey page or submits.
     * Output: `success` (boolean).
2. Equip your Agent or Generator Playbook with this tool so the agent can autonomously conduct the interview, fill the survey form, and submit the responses.
