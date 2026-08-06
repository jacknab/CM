#!/bin/bash

# Realtime API Verification Script
# Provides comprehensive error handling and logging for WebSocket and API key verification

# Ensure the script fails on any error
set -e

# Logging function
log_message() {
    local level="$1"
    local message="$2"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo "[$timestamp][$level] $message"
}

# Check for required environment variables
check_env_vars() {
    local api_key_vars=("AI_INTEGRATIONS_OPENAI_API_KEY" "OPENAI_API_KEY")
    local found_key=false

    for var in "${api_key_vars[@]}"; do
        if [[ -n "${!var}" ]]; then
            log_message "INFO" "API key found in environment variable: $var"
            found_key=true
            break
        fi
    done

    # If no key found, check .env file
    if [[ "$found_key" == "false" ]]; then
        local env_file="/apps/CM/.env"
        if [[ -f "$env_file" ]]; then
            local env_key=$(grep -E "^(AI_INTEGRATIONS_OPENAI_API_KEY|OPENAI_API_KEY)=" "$env_file" | cut -d'=' -f2)
            if [[ -n "$env_key" ]]; then
                log_message "INFO" "API key found in .env file"
                export AI_INTEGRATIONS_OPENAI_API_KEY="$env_key"
                found_key=true
            fi
        fi
    fi

    # Prompt for API key if still not found
    if [[ "$found_key" == "false" ]]; then
        read -p "No OpenAI API key found. Please enter your OpenAI API key: " user_api_key
        if [[ -n "$user_api_key" ]]; then
            export AI_INTEGRATIONS_OPENAI_API_KEY="$user_api_key"
            log_message "INFO" "API key provided via user input"
            found_key=true
        fi
    fi

    if [[ "$found_key" == "false" ]]; then
        log_message "ERROR" "No OpenAI API key found. Please set AI_INTEGRATIONS_OPENAI_API_KEY or OPENAI_API_KEY"
        exit 1
    fi
}

# Main verification function
verify_realtime_api() {
    log_message "INFO" "Starting Realtime API Verification"

    # Check environment variables first
    check_env_vars

    # Create logs directory if it doesn't exist
    mkdir -p /apps/CM/logs

    # Run the Node.js verification script
    node /apps/CM/verify-realtime-api.js

    # Capture the exit status
    local exit_status=$?

    if [[ $exit_status -eq 0 ]]; then
        log_message "SUCCESS" "Realtime API Verification completed successfully"
        exit 0
    else
        log_message "ERROR" "Realtime API Verification failed with exit code $exit_status"
        exit $exit_status
    fi
}

# Error handling wrapper
main() {
    trap 'log_message "ERROR" "Unexpected error occurred. Check logs for details."' ERR

    verify_realtime_api
}

# Execute main function
main