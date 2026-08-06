# 🔧 TWILIO WEBHOOK CONFIGURATION FIX

## PROBLEM IDENTIFIED

Twilio is calling:
```
❌ https://certxa.com/api/webhook/twilio
```

But the backend requires:
```
✅ https://certxa.com/api/webhook/twilio?storeId=2
```

**Result:** HTTP 403 (missing or invalid storeId parameter)

---

## ROOT CAUSE

The backend code at [`artifacts/api-server/src/routes/aiReceptionist.ts:1095`](/apps/CM/artifacts/api-server/src/routes/aiReceptionist.ts:1095) requires the `storeId` query parameter:

```typescript
const storeId = parseInt((req.query.storeId as string) ?? "", 10);

if (isNaN(storeId) || storeId <= 0) {
  return res.status(400).type("text/xml")
    .send(`<?xml version="1.0" encoding="UTF-8"?><Response><Reject reason="rejected"/></Response>`);
}
```

Without `?storeId=2`, the webhook returns 400/403.

---

## SOLUTION: UPDATE TWILIO CONSOLE

### Step 1: Log into Twilio Console
https://console.twilio.com/

### Step 2: Navigate to Phone Numbers
1. Click "Phone Numbers" → "Manage" → "Active Numbers"
2. Find and click on: **+1 619 604 6886**

### Step 3: Update Voice Configuration
Scroll to "Voice Configuration" section:

**A CALL COMES IN:**
- **Webhook URL:** `https://certxa.com/api/webhook/twilio?storeId=2`
- **HTTP Method:** POST
- **Primary Handler Fails:** (optional fallback URL)

### Step 4: Save Configuration
Click "Save" at the bottom of the page.

---

## VERIFICATION

### Test 1: Before Fix (Current State)
```
Twilio calls: https://certxa.com/api/webhook/twilio
Backend receives: storeId = undefined → NaN
Response: HTTP 400/403 <Reject reason="rejected"/>
Result: ❌ Twilio Error 11200
```

### Test 2: After Fix (Expected)
```
Twilio calls: https://certxa.com/api/webhook/twilio?storeId=2
Backend receives: storeId = 2 ✅
Backend validates: Store exists ✅
Backend generates: TwiML with <Connect><Stream> ✅
Response: HTTP 200 with TwiML
Result: ✅ Call connects to AI receptionist
```

---

## WHY THIS HAPPENS

The architecture uses a **multi-tenant system** where one backend server handles multiple salon stores. The `storeId` parameter tells the backend:
- Which store's phone number is receiving the call
- Which store's database to query for appointments
- Which store's settings to use for the AI conversation

**Store ID 2** appears to be the MySalon store based on these environment variables:
```bash
# From ai-receptionist/.env:
TWILIO_STORE_2_PHONE_NUMBER=+16196046886
DEFAULT_STORE_ID=2
DEFAULT_STORE_NAME=MySalon
```

---

## NGINX CONFIGURATION: ✅ CORRECT

The nginx configuration is **NOT** the problem. It correctly:
- Proxies to the right port (9200)
- Preserves query parameters in the URL
- Uses valid SSL certificate
- Returns NO 502 errors

Verification:
```bash
$ curl -X POST "https://certxa.com/api/webhook/twilio?storeId=2"
Response: HTTP 403 (signature validation - expected without Twilio signature)

$ curl -X POST "https://certxa.com/api/webhook/twilio"
Response: HTTP 400 (missing storeId - this is what Twilio is experiencing!)
```

---

## ALTERNATIVE SOLUTION: DEFAULT STORE ID

If you cannot update the Twilio configuration URL, you could modify the backend to **default to storeId=2** when not provided. However, this is NOT recommended because:

1. It breaks multi-tenancy (can't support multiple stores)
2. The Twilio URL is the proper place to specify which store
3. It's a 30-second fix in Twilio console

---

## POST-FIX VERIFICATION

After updating Twilio console:

### 1. Test Call
Call: **+1 619 604 6886**
Expected:
- AI receptionist answers
- No Twilio errors
- Call connects to OpenAI

### 2. Check Logs
```bash
pm2 logs certxa-api --lines 50 | grep "AI Receptionist"
```
Expected output:
```
[AI Receptionist] Validating Twilio signature for https://certxa.com/api/webhook/twilio?storeId=2
[AI Receptionist] ✓ Twilio signature valid
[AI Receptionist] Store 2 - MySalon - call connected
```

### 3. Verify No Errors in Twilio
Twilio Console → Monitor → Logs → Call Logs
- Should show HTTP 200 response
- No Error 11200
- Call status: completed

---

## SUMMARY

| Component | Status | Notes |
|-----------|--------|-------|
| Nginx Config | ✅ Fixed | Port 9200, valid SSL, no 502 errors |
| Backend Service | ✅ Running | certxa-api processing requests |
| SSL Certificate | ✅ Valid | Expires Aug 20, 2026 |
| Webhook Endpoint | ✅ Working | Returns correct responses |
| **Twilio URL Config** | ❌ **WRONG** | **Missing `?storeId=2`** |

**ACTION REQUIRED:** Update Twilio console webhook URL to include `?storeId=2`

This is a **5-minute fix** in the Twilio web console, not a code or infrastructure issue.
