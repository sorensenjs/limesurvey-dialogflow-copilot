# Dialogflow Infobot 2 Plugin for LimeSurvey 6

Conversational Co-Pilot integration for LimeSurvey 6 powered by Google Cloud Dialogflow Infobot 2 (`<chat-messenger>` Web SDK).

This plugin turns Dialogflow CX into an intelligent survey assistant that can:
- Walk survey respondents through questions interactively using voice or text.
- Read visible questions, answer options, and instructions from the page.
- Automatically fill in survey answers (text, radio, checkbox, dropdown, numbers) and trigger LimeSurvey ExpressionScript validations.
- Advance through survey pages and submit upon completion.
- Record the Dialogflow session ID directly into a LimeSurvey question field for auditing and cross-system correlation.

---

## 1. Directory Layout

```text
DialogflowInfobot/
├── DialogflowInfobot.php          # Main LimeSurvey 6 plugin class (with OAuth2 token broker)
├── config.xml                     # Plugin manifest
├── README.md                      # This documentation
└── assets/
    ├── js/
    │   └── ls-infobot-bridge.js   # Co-pilot client functions & LimeSurvey DOM bindings
    └── css/
        ├── df-messenger-default.css
        ├── chat-messenger-layout.css
        └── ls-infobot-theme.css   # Bootstrap 5 & LimeSurvey styling
```

---

## 2. Web SDK & Asset Delivery

The plugin utilizes the prebuilt, production `<chat-messenger>` Web SDK delivered directly via Google's CDN:

- **JavaScript SDK**: `https://www.gstatic.com/chat-messenger/sdk/prod/latest/chat-messenger.js`
- **Default Theme CSS**: `https://www.gstatic.com/chat-messenger/sdk/prod/latest/themes/chat-messenger-default.css`
- **Layout CSS**: `https://www.gstatic.com/chat-messenger/sdk/prod/latest/themes/chat-messenger-layout.css`

No compilation, Node.js tooling, or local build steps are required. The plugin automatically enqueues these CDN assets into the survey page alongside the client-side bridge script.

---

## 3. Installation in LimeSurvey 6

### Option A: Via Plugin Manager (Web UI)
1. Download or package the plugin directory into a `.zip` archive:
   ```bash
   zip -r DialogflowInfobot.zip DialogflowInfobot/
   ```
2. In the LimeSurvey Admin Panel, go to **Configuration > Plugins > Plugin Manager**.
3. Click **Upload & install plugin** and select `DialogflowInfobot.zip`.
4. Locate **DialogflowInfobot** in the list and click **Activate**.

### Option B: Direct Filesystem Copy
1. Copy the `DialogflowInfobot` folder into your LimeSurvey `plugins/` directory:
   ```bash
   cp -r DialogflowInfobot /var/www/html/plugins/
   ```
2. Go to **Configuration > Plugins > Plugin Manager** and click **Activate** next to **DialogflowInfobot**.

---

## 4. Authentication Configuration

The plugin includes a built-in server-side token broker endpoint (`/index.php/plugins/direct?plugin=DialogflowInfobot&function=getAccessToken`) that provides short-lived, ephemeral OAuth2 access tokens to the frontend widget:

1. In the **Plugin Manager**, click **Configure** next to **DialogflowInfobot**.
2. **GCP Compute Engine / GKE (Recommended)**:
   - If running on GCP, leave the **Service Account JSON Key** field empty. The plugin will automatically mint ephemeral access tokens via the GCP Instance Metadata Server (`http://metadata.google.internal/...`).
   - Ensure the VM/workload service account has the **Dialogflow API Client** (`roles/dialogflow.client`) role.
3. **On-Premise / Non-GCP Hosting**:
   - Paste a Google Cloud Service Account JSON key into the configuration field.
   - Ensure the service account has the **Dialogflow API Client** (`roles/dialogflow.client`) role.
4. (Optional) Enter a **Default Deployment Name** in the format:
   `projects/<PROJECT_ID>/locations/<LOCATION>/apps/<APP_ID>/deployments/<DEPLOYMENT_ID>`

---

## 5. Configuring a Survey

1. Open your survey in the LimeSurvey 6 admin interface.
2. Navigate to **Survey Settings > Dialogflow Assistant**.
3. Configure the survey options:
   - **Enable Conversational Co-Pilot**: Set to `Yes`.
   - **Dialogflow Deployment Name**: Enter your Dialogflow CX Web UI deployment resource name:
     `projects/<PROJECT_ID>/locations/<LOCATION>/apps/<APP_ID>/deployments/<DEPLOYMENT_ID>`
   - **Chat Title**: (e.g., `Survey Co-Pilot` or `Assistant`).
   - **Widget Display Mode**: `Slide-Over Drawer` (recommended) or `Floating Dialog`.
   - **Auto-Open Chat**: Whether to automatically slide the drawer open when the survey loads.
   - **Session Tracking Question Code**: (Optional) Enter the question code of a short-text or hidden question (e.g., `DFSESSION`) to automatically store the Dialogflow session ID with the survey submission.

---

## 6. Configuring the Dialogflow CX Agent

In the **Dialogflow CX Console** or **Vertex AI Search and Conversation**:

1. Define a **Client-Side Tool** named `limesurvey_copilot` with the following actions:

   - **`ls_get_page_questions`**:
     - **Description**: Retrieves all questions, question texts, mandatory flags, and choice options on the currently visible survey page.
     - **Output Parameters**:
       - `surveyId` (string)
       - `pageQuestions` (list of objects with `code`, `text`, `isMandatory`, `options`)

   - **`ls_answer_question`**:
     - **Description**: Answers a survey question on the active page (supports text, textarea, radio/single-choice, checkbox/multi-choice, and dropdowns).
     - **Input Parameters**:
       - `questionCode` (string, required)
       - `value` (string, required for text/number)
       - `optionCode` (string, optional for radio/checkbox/dropdown)
     - **Output Parameters**:
       - `success` (boolean)
       - `message` (string)

   - **`ls_highlight_question`**:
     - **Description**: Smoothly scrolls to and visually highlights a question container on the page.
     - **Input Parameters**:
       - `questionCode` (string, required)
     - **Output Parameters**:
       - `success` (boolean)

   - **`ls_advance_page`**:
     - **Description**: Clicks the survey submission/next button to validate answers and navigate to the next page.
     - **Output Parameters**:
       - `success` (boolean)
       - `action` (string)

2. Equip your Agent or Generator Playbook with the `limesurvey_copilot` tool so the agent can interact with the LimeSurvey DOM directly during the session.

---

## 7. License

This project is licensed under the Apache License 2.0.
