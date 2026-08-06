const fs = require('fs');
const path = require('path');

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
            console.log(`✅ API key found in environment variable: ${varName}`);
            return apiKey;
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
                    console.log(`✅ API key found in .env file: ${match[0].split('=')[0]}`);
                    return match[1].trim();
                }
            }
        }
    } catch (error) {
        console.error('Error reading .env file:', error.message);
    }
    return null;
}

// Main verification function
function verifyOpenAIKey() {
    console.log('🔍 Verifying OpenAI API Key Configuration...');

    // Check environment variables first
    let apiKey = checkEnvironmentVariables();

    // If not found in environment, check .env file
    if (!apiKey) {
        apiKey = checkDotEnvFile();
    }

    // If no API key found
    if (!apiKey) {
        console.error('❌ No OpenAI API key found!');
        console.error('Please set one of the following:');
        console.error('- AI_INTEGRATIONS_OPENAI_API_KEY');
        console.error('- OPENAI_API_KEY');
        console.error('In environment variables or .env file');
        process.exit(1);
    }

    // Basic validation of API key format
    const apiKeyRegex = /^sk-[a-zA-Z0-9]{48}$/;
    if (!apiKeyRegex.test(apiKey)) {
        console.warn('⚠️ API key format looks unusual. Please verify.');
    }

    console.log('✅ OpenAI API Key configuration verified successfully!');
    return true;
}

// Run the verification
verifyOpenAIKey();