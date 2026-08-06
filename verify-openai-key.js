const fs = require('fs');
const path = require('path');
const https = require('https');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

// Logging function
function log(level, message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ${message}`);
}

// Function to validate OpenAI API key format
function validateApiKeyFormat(apiKey) {
    // Basic regex for OpenAI API key format
    const apiKeyRegex = /^sk-[a-zA-Z0-9]{48}$/;
    return apiKeyRegex.test(apiKey);
}

// Function to test API key by making a simple API call
async function testOpenAIApiKey(apiKey) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.openai.com',
            path: '/v1/models',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode === 200) {
                    log('INFO', 'OpenAI API key successfully validated');
                    resolve(true);
                } else {
                    log('ERROR', `API key validation failed. Status code: ${res.statusCode}`);
                    log('ERROR', `Response: ${data}`);
                    reject(new Error(`API key validation failed. Status code: ${res.statusCode}`));
                }
            });
        });

        req.on('error', (error) => {
            log('ERROR', `Network error during API key validation: ${error.message}`);
            reject(error);
        });

        req.end();
    });
}

// Function to check API key from environment variables
function checkEnvironmentVariables() {
    const apiKeyVars = [
        'AI_INTEGRATIONS_OPENAI_API_KEY', 
        'OPENAI_API_KEY', 
        'OPENAI_KEY'
    ];

    for (const varName of apiKeyVars) {
        const apiKey = process.env[varName];
        if (apiKey && apiKey.trim() !== '') {
            log('INFO', `API key found in environment variable: ${varName}`);
            return apiKey.trim();
        }
    }
    return null;
}

// Function to check API key from .env file
function checkDotEnvFile() {
    const dotEnvPath = path.join(__dirname, '.env');
    try {
        if (fs.existsSync(dotEnvPath)) {
            const dotEnvContent = fs.readFileSync(dotEnvPath, 'utf8');
            const apiKeyMatches = [
                /AI_INTEGRATIONS_OPENAI_API_KEY\s*=\s*([^\n]+)/,
                /OPENAI_API_KEY\s*=\s*([^\n]+)/,
                /OPENAI_KEY\s*=\s*([^\n]+)/
            ];

            for (const regex of apiKeyMatches) {
                const match = dotEnvContent.match(regex);
                if (match && match[1] && match[1].trim() !== '') {
                    log('INFO', `API key found in .env file: ${match[0].split('=')[0]}`);
                    return match[1].trim();
                }
            }
        }
    } catch (error) {
        log('ERROR', `Error reading .env file: ${error.message}`);
    }
    return null;
}

// Main verification function
async function verifyOpenAIKey() {
    log('INFO', 'Starting OpenAI API Key Verification');

    try {
        // Check environment variables first
        let apiKey = checkEnvironmentVariables();

        // If not found in environment, check .env file
        if (!apiKey) {
            apiKey = checkDotEnvFile();
        }

        // If no API key found
        if (!apiKey) {
            log('ERROR', 'No OpenAI API key found');
            log('ERROR', 'Please set one of the following:');
            log('ERROR', '- AI_INTEGRATIONS_OPENAI_API_KEY');
            log('ERROR', '- OPENAI_API_KEY');
            log('ERROR', 'In environment variables or .env file');
            process.exit(1);
        }

        // Validate API key format
        if (!validateApiKeyFormat(apiKey)) {
            log('WARN', 'API key format looks unusual. Attempting validation...');
        }

        // Test the API key
        await testOpenAIApiKey(apiKey);

        log('SUCCESS', 'OpenAI API Key configuration verified successfully');
        process.exit(0);
    } catch (error) {
        log('ERROR', `API key verification failed: ${error.message}`);
        process.exit(1);
    }
}

// Run the verification
verifyOpenAIKey();