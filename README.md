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

## 6. Configuring the Agent in CX Agent Studio / Customer Engagement Suite (CES)

In **Agent Studio** or **Dialogflow CX Console**:

### 1. Create Client Function Tools
Create 4 separate **Client Function** tools (Tools > Create > Type: **Client Function**):

1. **`ls_get_page_questions`**:
   - **Display Name**: `ls_get_page_questions`
   - **Description**: Inspects the active LimeSurvey page in the user's browser and returns the questions, question codes, and options.
   - **Parameters**: Object (no required inputs).
   - **Response**:
     ```json
     {
       "type": "OBJECT",
       "properties": {
         "surveyId": { "type": "STRING" },
         "pageQuestions": {
           "type": "ARRAY",
           "items": {
             "type": "OBJECT",
             "properties": {
               "code": { "type": "STRING" },
               "text": { "type": "STRING" },
               "isMandatory": { "type": "BOOLEAN" },
               "options": {
                 "type": "ARRAY",
                 "items": {
                   "type": "OBJECT",
                   "properties": {
                     "optionCode": { "type": "STRING" },
                     "label": { "type": "STRING" }
                   }
                 }
               }
             }
           }
         }
       }
     }
     ```

2. **`ls_answer_question`**:
   - **Display Name**: `ls_answer_question`
   - **Description**: Fills in an answer for a question in the LimeSurvey form.
   - **Parameters**:
     - `questionCode` (string, required): The question code (e.g., `DEPT`, `FEEDBACK`) or index (`1`, `2`).
     - `value` (string, optional): Text or numeric value to fill.
     - `optionCode` (string, optional): Option code for radio, checkbox, or dropdown questions.
   - **Response**: `success` (boolean), `message` (string).

3. **`ls_highlight_question`**:
   - **Display Name**: `ls_highlight_question`
   - **Description**: Scrolls the user's browser viewport to the question and highlights it.
   - **Parameters**:
     - `questionCode` (string, required).
   - **Response**: `success` (boolean).

4. **`ls_advance_page`**:
   - **Display Name**: `ls_advance_page`
   - **Description**: Submits the page or advances to the next page in LimeSurvey.
   - **Parameters**: Object (no required inputs).
   - **Response**: `success` (boolean), `action` (string).

> [!NOTE]
> `ls-infobot-bridge.js` automatically maps incoming CES tool UUIDs and display names directly to the browser DOM handlers.

### 2. Attach Tools to Agent
Make sure all 4 tools (`ls_get_page_questions`, `ls_answer_question`, `ls_highlight_question`, `ls_advance_page`) are attached to your **Root Agent** under **Tools**.

### 3. Agent Instruction / Persona
Add behavioral instructions to your agent prompt:

```markdown
# Role & Persona
You are the LimeSurvey Conversational Co-Pilot. Your goal is to guide respondents through completing the survey by conducting a friendly, efficient interview, filling out the fields on their behalf, and answering any clarifying questions they have.

# Core Behavioral Guidelines
1. Always inspect the page first:
   - At the beginning of the conversation, or whenever the user indicates they moved to a new page, call `ls_get_page_questions` to inspect the available questions and choices.
2. One question at a time:
   - Walk through questions sequentially.
   - Before asking a question, call `ls_highlight_question(questionCode)` to guide the user's visual focus on the survey form.
3. Handling Choice Questions (Radio / Dropdown / Checkbox):
   - Present options clearly.
   - When the user answers in natural language (e.g., "I work in Sales", "definitely agree"), match their intent to the closest `optionCode` from the question's `options` list.
   - Call `ls_answer_question(questionCode, optionCode=...)`.
   - Briefly confirm what was selected.
4. Handling Open-Ended / Free Text Questions:
   - Ask the question conversationally.
   - If the user provides a very short or vague answer, politely ask one follow-up to elicit richer feedback.
   - Synthesize their thoughts and call `ls_answer_question(questionCode, value=...)`.
5. Advancing the Survey:
   - Once all mandatory questions on the current page have been answered, ask if the user is ready to submit / move to the next page.
   - When confirmed, call `ls_advance_page()`.
```

---

## 7. License

This project is licensed under the Apache License 2.0.
