# Google Business Profile API - Environment Configuration Guide

## Overview
This guide helps you set up the Google Business Profile API integration for your booking platform. You'll need to:
1. Create a project in Google Cloud Console
2. Enable the Business Profile API
3. Create OAuth2 credentials
4. Add environment variables

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click on the project dropdown at the top
3. Click "NEW PROJECT"
4. Enter project name: "Booking Platform - Google Reviews"
5. Click "CREATE"
6. Wait for the project to be created

## Step 2: Enable Required APIs

Once your project is created:

1. In the Cloud Console, search for "My Business Business Information API"
2. Click on the result
3. Click "ENABLE"
4. Search for "My Business Account Management API"
5. Click on the result
6. Click "ENABLE"

## Step 3: Create OAuth2 Credentials

1. Go to "Credentials" in the left sidebar
2. Click "CREATE CREDENTIALS"
3. Choose "OAuth client ID"
4. If prompted, first create a "OAuth consent screen":
   - User Type: "External"
   - Click "CREATE"
   - App name: "Booking Platform - Google Reviews"
   - User support email: your email
   - Developer contact info: your email
   - Click "SAVE AND CONTINUE"
   - Add scopes:
     - Click "ADD OR REMOVE SCOPES"
     - Search for and add:
       - `https://www.googleapis.com/auth/business.manage`
       - `https://www.googleapis.com/auth/userinfo.email`
       - `https://www.googleapis.com/auth/userinfo.profile`
     - Click "UPDATE"
   - Click "SAVE AND CONTINUE"
   - Leave test users empty for now (we'll add them later for testing)
   - Click "SAVE AND CONTINUE"

5. Back on the Credentials page, click "CREATE CREDENTIALS" again
6. Choose "OAuth client ID"
7. Application type: "Web application"
8. Name: "Booking Platform Web"
9. Add Authorized JavaScript origins:
   - http://localhost:3000
   - http://localhost:5173
   - https://yourdomain.com (your production domain)
10. Add Authorized redirect URIs:
    - http://localhost:3000/api/google-business/callback
    - http://localhost:5173/api/google-business/callback
    - https://yourdomain.com/api/google-business/callback
11. Click "CREATE"
12. Click "DOWNLOAD JSON" or copy the credentials

## Step 4: Add Environment Variables

In your `.env` file, add:

```bash
# Google API Credentials
GOOGLE_CLIENT_ID=YOUR_CLIENT_ID_HERE
GOOGLE_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google-business/callback

# For production:
# GOOGLE_REDIRECT_URI=https://yourdomain.com/api/google-business/callback

# Google Business Profile Settings
GOOGLE_BUSINESS_API_SYNC_INTERVAL=3600000  # Sync every hour (in milliseconds)
```

### Where to get the values:

1. **GOOGLE_CLIENT_ID**: The client ID from the JSON credentials file
2. **GOOGLE_CLIENT_SECRET**: The client secret from the JSON credentials file
3. **GOOGLE_REDIRECT_URI**: The redirect URI you configured in Google Cloud Console

## Step 5: Database Migration

Run the database migration to create the necessary tables:

```bash
# Create the migration
npm run db:push

# Or if using Drizzle Kit directly:
npx drizzle-kit push
```

The following tables will be created:
- `google_business_profiles`: Stores API credentials and business account info
- `google_reviews`: Stores reviews fetched from Google
- `google_review_responses`: Stores staff responses to reviews

## Step 6: Install Dependencies

Run:

```bash
npm install
```

This will install the required Google API libraries:
- `googleapis`: Google APIs Node.js client
- `google-auth-library`: Google authentication library

## Step 7: Add Testing Users (for OAuth Consent)

During development, you need to add your email as a test user:

1. In the OAuth consent screen settings, click "ADD USERS"
2. Add the email accounts that will test the feature
3. Click "SAVE"

## Step 8: Test the Integration

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Navigate to your store settings
3. Click "Connect Google Business Profile"
4. You'll be redirected to Google's login
5. Sign in with a Google account that has access to a Google Business Profile
6. Select your business account and location
7. Confirm the connection

## Troubleshooting

### Issue: "Invalid redirect URI"
- Make sure the redirect URI in your `.env` file matches exactly what you configured in Google Cloud Console
- Check for trailing slashes or protocol mismatches (http vs https)

### Issue: "The redirect_uri parameter does not match"
- Verify that the redirect URI is configured in both:
  - Your `.env` file
  - Google Cloud Console credentials page
- Restart the server after changing the `.env` file

### Issue: "Insufficient permissions"
- Make sure you added the correct scopes:
  - `https://www.googleapis.com/auth/business.manage`
- The user account must have access to a Google Business Profile

### Issue: "No Google Business accounts found"
- Make sure the Google account has access to at least one Google Business Profile
- Try accessing [Google Business Profile Manager](https://business.google.com/) directly to verify access

## API Endpoints Created

### Authentication & Setup
- `GET /api/google-business/auth-url`: Get OAuth authorization URL
- `POST /api/google-business/callback`: Handle OAuth callback
- `POST /api/google-business/locations`: Get locations for a business account
- `POST /api/google-business/connect-location`: Connect a location to the store
- `GET /api/google-business/profile/:storeId`: Get connected profile info

### Review Management
- `GET /api/google-business/reviews/:storeId`: List reviews with filters
- `GET /api/google-business/reviews/:storeId/:reviewId`: Get review details
- `GET /api/google-business/reviews-stats/:storeId`: Get review statistics
- `POST /api/google-business/sync-reviews/:storeId`: Sync reviews from Google

### Response Management
- `POST /api/google-business/review-response`: Create a draft response
- `PATCH /api/google-business/review-response/:responseId`: Update a response
- `POST /api/google-business/review-response/:responseId/publish`: Publish response to Google
- `DELETE /api/google-business/review-response/:responseId`: Delete a response

## Security Notes

1. **Never commit credentials**: Never commit your `.env` file with real credentials
2. **Use environment variables**: Always use environment variables in production
3. **Refresh tokens**: The system automatically handles token refresh
4. **Scopes**: Only requested scopes are granted - minimal permissions principle
5. **Rate limiting**: Google has rate limits - implement exponential backoff for retries

## Next Steps

1. Set up automated review syncing (cron job or scheduled task)
2. Configure email/SMS notifications for new reviews
3. Set up admin alerts for negative reviews
4. Integrate with your customer management system
5. Create dashboard views for review analytics
