<?php

use \LimeSurvey\PluginManager\PluginBase;

class DialogflowInfobot extends PluginBase
{
    protected $storage = 'DbStorage';
    protected static $description = 'Dialogflow Infobot 2 Conversational Co-Pilot for LimeSurvey 6';
    protected static $name = 'DialogflowInfobot';

    protected $settings = [
        'gcpServiceAccountJson' => [
            'type' => 'text',
            'label' => 'Google Cloud Service Account JSON Key',
            'help' => 'Must have "Dialogflow API User" / "Dialogflow Client" role.',
            'htmlOptions' => ['rows' => 8, 'class' => 'form-control font-monospace'],
        ],
        'defaultDeploymentName' => [
            'type' => 'string',
            'label' => 'Default Deployment Name',
            'help' => 'Format: projects/{project}/locations/{location}/apps/{app}/deployments/{deployment}',
            'htmlOptions' => ['class' => 'form-control'],
        ],
    ];

    public function init()
    {
        $this->subscribe('beforeSurveyPage');
        $this->subscribe('beforeSurveySettings');
        $this->subscribe('newSurveySettings');
        $this->subscribe('newDirectRequest');
    }

    /**
     * Define survey-level configuration in LimeSurvey 6 admin
     */
    public function beforeSurveySettings()
    {
        $event = $this->getEvent();
        $surveyId = $event->get('survey');

        $event->set('surveysettings.' . $this->id, [
            'name' => get_class($this),
            'settings' => [
                'enabled' => [
                    'type' => 'boolean',
                    'label' => 'Enable Conversational Co-Pilot',
                    'current' => $this->get('enabled', 'Survey', $surveyId, false),
                ],
                'deploymentName' => [
                    'type' => 'string',
                    'label' => 'Dialogflow Deployment Name',
                    'help' => 'Leave blank to inherit global default.',
                    'current' => $this->get('deploymentName', 'Survey', $surveyId, ''),
                    'htmlOptions' => ['class' => 'form-control'],
                ],
                'chatTitle' => [
                    'type' => 'string',
                    'label' => 'Assistant Title',
                    'default' => 'Survey Co-Pilot',
                    'current' => $this->get('chatTitle', 'Survey', $surveyId, 'Survey Co-Pilot'),
                    'htmlOptions' => ['class' => 'form-control'],
                ],
                'renderMode' => [
                    'type' => 'select',
                    'label' => 'Widget Display Mode',
                    'options' => [
                        'slide-over' => 'Slide-Over Drawer (Recommended for Co-Pilot)',
                        'bubble' => 'Floating Bubble',
                    ],
                    'current' => $this->get('renderMode', 'Survey', $surveyId, 'slide-over'),
                    'htmlOptions' => ['class' => 'form-select'],
                ],
                'autoOpenChat' => [
                    'type' => 'boolean',
                    'label' => 'Auto-open chat on survey page load',
                    'current' => $this->get('autoOpenChat', 'Survey', $surveyId, true),
                ],
                'sessionTrackingQuestion' => [
                    'type' => 'string',
                    'label' => 'Question Code for Dialogflow Session ID',
                    'help' => 'Question code (e.g. DFSESSION) to store session ID for audit/transcripts.',
                    'current' => $this->get('sessionTrackingQuestion', 'Survey', $surveyId, ''),
                    'htmlOptions' => ['class' => 'form-control'],
                ],
            ],
        ]);
    }

    public function newSurveySettings()
    {
        $event = $this->getEvent();
        $surveyId = $event->get('survey');
        $settings = $event->get('settings');

        foreach ($settings as $key => $val) {
            $this->set($key, $val, 'Survey', $surveyId);
        }
    }

    /**
     * Inject scripts, stylesheets, and runtime configs into the survey page
     */
    public function beforeSurveyPage()
    {
        $event = $this->getEvent();
        $surveyId = $event ? $event->get('surveyId') : null;
        if (!$surveyId) {
            $surveyId = Yii::app()->request->getParam('sid') ?: Yii::app()->request->getParam('surveyid');
        }
        if (!$surveyId || !$this->get('enabled', 'Survey', $surveyId, false)) {
            return;
        }

        $deployment = $this->get('deploymentName', 'Survey', $surveyId);
        if (empty($deployment)) {
            $deployment = $this->get('defaultDeploymentName');
        }

        // 1. Enqueue CSS from CDN and custom theme
        Yii::app()->clientScript->registerCssFile('https://www.gstatic.com/chat-messenger/sdk/prod/latest/themes/chat-messenger-default.css');
        Yii::app()->clientScript->registerCssFile('https://www.gstatic.com/chat-messenger/sdk/prod/latest/themes/chat-messenger-layout.css');
        
        $pluginDir = dirname(__FILE__);
        $themeCssFile = $pluginDir . '/assets/css/ls-infobot-theme.css';
        if (file_exists($themeCssFile)) {
            Yii::app()->clientScript->registerCss('ls_infobot_theme_css', file_get_contents($themeCssFile));
        }

        // 2. Build Client Config
        $clientConfig = [
            'deploymentName' => $deployment,
            'chatTitle' => $this->get('chatTitle', 'Survey', $surveyId, 'Survey Co-Pilot'),
            'renderMode' => $this->get('renderMode', 'Survey', $surveyId, 'slide-over'),
            'autoOpenChat' => (bool)$this->get('autoOpenChat', 'Survey', $surveyId, true),
            'sessionTrackingQuestion' => $this->get('sessionTrackingQuestion', 'Survey', $surveyId, ''),
            'tokenEndpoint' => Yii::app()->createUrl('plugins/direct', [
                'plugin' => 'DialogflowInfobot',
                'function' => 'getAccessToken',
                'sid' => $surveyId,
            ]),
            'surveyContext' => [
                'surveyId' => $surveyId,
                'token' => Yii::app()->request->getParam('token', ''),
                'language' => Yii::app()->language,
            ],
        ];

        Yii::app()->clientScript->registerScript(
            'ls_dialogflow_copilot_config',
            'window.LS_DIALOGFLOW_CONFIG = ' . json_encode($clientConfig) . ';',
            \CClientScript::POS_HEAD
        );

        // 3. Register Bridge JS (inline for reliable execution) & Widget Script from CDN
        $bridgeJsFile = $pluginDir . '/assets/js/ls-infobot-bridge.js';
        if (file_exists($bridgeJsFile)) {
            Yii::app()->clientScript->registerScript('ls_infobot_bridge_js', file_get_contents($bridgeJsFile), \CClientScript::POS_END);
        }
        Yii::app()->clientScript->registerScriptFile('https://www.gstatic.com/chat-messenger/sdk/prod/latest/chat-messenger.js', \CClientScript::POS_END);
    }

    /**
     * Handle Direct Request: Server-Side Token Broker Endpoint
     */
    public function newDirectRequest()
    {
        $event = $this->getEvent();
        if ($event->get('target') !== 'DialogflowInfobot') {
            return;
        }

        if ($event->get('function') === 'getAccessToken') {
            $this->handleTokenBroker();
        }
    }

    private function handleTokenBroker()
    {
        header('Content-Type: application/json; charset=UTF-8');

        $surveyId = Yii::app()->request->getParam('sid');
        // Validate active survey session in LimeSurvey
        if (!$surveyId || !isset($_SESSION['survey_' . $surveyId])) {
            http_response_code(403);
            echo json_encode(['error' => 'Unauthorized: No active survey session']);
            exit;
        }

        // Check cached token in session
        $cacheKey = 'gcp_df_token_' . $surveyId;
        if (isset($_SESSION[$cacheKey]) && $_SESSION[$cacheKey]['expiresAt'] > time() + 120) {
            echo json_encode($_SESSION[$cacheKey]);
            exit;
        }

        $saJson = $this->get('gcpServiceAccountJson');
        if (empty($saJson)) {
            // Automatically check GCP Compute Engine / Cloud metadata server
            $metadataToken = $this->getMetadataServerToken();
            if ($metadataToken) {
                $_SESSION[$cacheKey] = $metadataToken;
                echo json_encode($metadataToken);
                exit;
            }

            http_response_code(500);
            echo json_encode(['error' => 'GCP Service Account credentials not configured']);
            exit;
        }

        try {
            $tokenData = $this->mintGoogleAccessToken($saJson);
            $_SESSION[$cacheKey] = $tokenData;
            echo json_encode($tokenData);
        } catch (\Exception $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Token minting failed: ' . $e->getMessage()]);
        }
        exit;
    }

    /**
     * Retrieve OAuth2 token from Google Compute Engine Metadata Server
     */
    private function getMetadataServerToken(): ?array
    {
        $ch = curl_init('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token');
        curl_setopt_array($ch, [
            CURLOPT_HTTPHEADER => ['Metadata-Flavor: Google'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 3,
        ]);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode === 200 && !empty($response)) {
            $data = json_decode($response, true);
            if (!empty($data['access_token'])) {
                return [
                    'accessToken' => $data['access_token'],
                    'expiresAt' => time() + ($data['expires_in'] ?? 3600),
                ];
            }
        }
        return null;
    }

    /**
     * Mint OAuth2 Access Token using Google Service Account RS256 JWT
     */
    private function mintGoogleAccessToken(string $saJson): array
    {
        $sa = json_decode($saJson, true);
        if (!$sa || empty($sa['client_email']) || empty($sa['private_key'])) {
            throw new \InvalidArgumentException('Invalid Service Account JSON');
        }

        $now = time();
        $header = ['alg' => 'RS256', 'typ' => 'JWT'];
        $claim = [
            'iss' => $sa['client_email'],
            'scope' => 'https://www.googleapis.com/auth/cloud-platform',
            'aud' => 'https://oauth2.googleapis.com/token',
            'exp' => $now + 3600,
            'iat' => $now,
        ];

        $b64Header = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode(json_encode($header)));
        $b64Claim  = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode(json_encode($claim)));
        $signatureInput = $b64Header . '.' . $b64Claim;

        $binarySignature = '';
        if (!openssl_sign($signatureInput, $binarySignature, $sa['private_key'], OPENSSL_ALGO_SHA256)) {
            throw new \RuntimeException('Failed to sign JWT with OpenSSL');
        }
        $b64Signature = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($binarySignature));
        $jwt = $signatureInput . '.' . $b64Signature;

        // Exchange JWT with Google OAuth2 Token Endpoint
        $ch = curl_init('https://oauth2.googleapis.com/token');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query([
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion' => $jwt,
            ]),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200) {
            throw new \RuntimeException('Google OAuth2 exchange failed: ' . $response);
        }

        $res = json_decode($response, true);
        return [
            'accessToken' => $res['access_token'],
            'expiresAt' => $now + ($res['expires_in'] ?? 3600),
        ];
    }
}
