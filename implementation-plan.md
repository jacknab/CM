o # Implementation Plan

## Phase 1: Fix Configuration Issues

### 1. Configure Twilio Phone Number
- **Task**: Add Twilio phone number to main .env file
- **File**: /apps/CM/.env
- **Action**: Set TWILIO_PHONE_NUMBER=+16196046886 (from ai-receptionist/.env)
- **Reason**: Enable SMS functionality for the main application

### 2. Verify OpenAI API Key
- **Task**: Confirm OpenAI API key is properly configured
- **Files**: 
  - /apps/CM/artifacts/api-server/.env (already configured)
  - /apps/CM/ai-receptionist/.env (already configured)
- **Action**: No changes needed

## Phase 2: Deploy AI Receptionist Process

### 1. Create PM2 Configuration for AI Receptionist
- **Task**: Create ecosystem.config.js for AI receptionist
- **File**: /apps/CM/ai-receptionist/ecosystem.config.js
- **Configuration**:
  ```javascript
  module.exports = {
    apps: [{
      name: "ai-receptionist",
      script: "./dist/index.js", // Assuming TypeScript compilation
      cwd: "/apps/CM/ai-receptionist",
      env: {
        NODE_ENV: "production",
        PORT: "9210",
        DATABASE_URL: "postgresql://certxausr_1:<DB_PASSWORD>@localhost:5432/certxadata_1",
        APP_URL: "https://certxa.com",
        TWILIO_GLOBAL_ACCOUNT_SID: "<TWILIO_ACCOUNT_SID>",
        TWILIO_GLOBAL_AUTH_TOKEN: "<TWILIO_AUTH_TOKEN>",
        TWILIO_STORE_2_PHONE_NUMBER: "+16196046886",
        OPENAI_API_KEY: "<YOUR_OPENAI_API_KEY>",
        SESSION_SECRET: "<YOUR_SESSION_SECRET>",
        DEFAULT_STORE_ID: "2",
        DEFAULT_STORE_TIMEZONE: "UTC",
        DEFAULT_STORE_NAME: "MySalon"
      }
    }]
  };
  ```

### 2. Build and Start AI Receptionist
- **Task**: Compile and start the AI receptionist process
- **Commands**:
  ```bash
  cd /apps/CM/ai-receptionist
  # If TypeScript, compile first:
  # tsc
  pm2 start ecosystem.config.js
  pm2 save
  ```

## Phase 3: Verify Integration

### 1. Test Twilio Webhook
- **Task**: Verify Twilio webhook is accessible
- **Endpoint**: POST https://certxa.com/api/webhook/twilio?storeId=2
- **Expected Response**: TwiML with Stream connection

### 2. Test Media Stream WebSocket
- **Task**: Verify WebSocket connection for audio streaming
- **Endpoint**: wss://certxa.com/media-stream
- **Expected Behavior**: Successful WebSocket handshake

### 3. Test Booking Integration
- **Task**: Verify AI can create bookings through existing API
- **Method**: Simulate a call through the system
- **Expected Result**: New appointment created in database

## Phase 4: Monitor and Optimize

### 1. Monitor Call Logs
- **Task**: Check ai_call_log table for entries
- **Verification**: Confirm calls are being logged properly

### 2. Performance Tuning
- **Task**: Optimize for <800ms latency target
- **Focus Areas**:
  - Database query optimization
  - WebSocket connection efficiency
  - Audio processing pipeline

## Risk Mitigation

### 1. Rollback Plan
- **Action**: Document current working state
- **Backup**: PM2 process list and configurations

### 2. Monitoring
- **Action**: Set up logging for AI receptionist
- **Tools**: PM2 logs, database monitoring

## Timeline

1. **Phase 1**: 30 minutes
2. **Phase 2**: 1 hour
3. **Phase 3**: 1 hour
4. **Phase 4**: Ongoing

## Success Criteria

1. Twilio calls successfully connect to AI receptionist
2. Audio streams properly between Twilio and OpenAI
3. Bookings can be created, cancelled, and rescheduled via voice
4. Multi-tenant isolation maintained
5. System operates with <800ms latency