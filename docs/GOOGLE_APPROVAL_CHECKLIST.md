# Google Business Profile API - Approval Checklist

This checklist helps you prepare your application for approval from Google. Google reviews applications that use their APIs to ensure they comply with their policies and provide a good user experience.

## Pre-Submission Requirements

### 1. Application Information
- [ ] Application name is clear and descriptive
- [ ] Application description explains how you use the Google Business Profile API
- [ ] Company/organization name is accurate
- [ ] Valid contact email address
- [ ] Privacy policy URL is publicly accessible
- [ ] Terms of service URL is publicly accessible

### 2. OAuth Consent Screen
- [ ] Logo image is professional and clear (minimum 120x120px recommended)
- [ ] "User data usage" statement is complete and accurate
- [ ] Statement explains that the app will manage Google Business Profile reviews
- [ ] Statement discloses any third-party data sharing
- [ ] Support email is responses and monitored
- [ ] Developer contact information is complete

### 3. Scopes - CRITICAL
- [ ] You're only requesting necessary scopes:
  - `https://www.googleapis.com/auth/business.manage` (required for reviews)
  - `https://www.googleapis.com/auth/userinfo.email` (for user identification)
  - `https://www.googleapis.com/auth/userinfo.profile` (for user identification)
- [ ] Scopes are justified on the consent screen
- [ ] You're NOT requesting unnecessary scopes (e.g., Gmail, Calendar, etc.)

### 4. Application Functionality
- [ ] Clear feature: View reviews from Google Business Profile
- [ ] Clear feature: Respond to reviews
- [ ] Clear feature: Manage review responses
- [ ] Clear feature: View review statistics
- [ ] Feature: Sync reviews with centralized database
- [ ] NO feature: Automatically deleting reviews (users manually choose)
- [ ] NO feature: Hiding or suppressing reviews
- [ ] NO feature: Manipulating review ratings

### 5. Data Handling & Privacy
- [ ] Privacy policy includes Google API usage
- [ ] Privacy policy explains what data is collected
- [ ] Privacy policy explains how data is stored
- [ ] Privacy policy explains how long data is retained
- [ ] Clear explanation: You only access reviews with user permission
- [ ] Clear explanation: Reviews are securely stored
- [ ] Clear explanation: Users can disconnect at any time
- [ ] Clear explanation: Disconnecting removes all Google-related data
- [ ] Implementation: Data is encrypted in transit (HTTPS)
- [ ] Implementation: Sensitive tokens are never logged
- [ ] Implementation: Refresh tokens are securely stored

### 6. User Experience & Transparency
- [ ] Clear indication when Google Business Profile is connected/disconnected
- [ ] Users can see exactly what data is being accessed
- [ ] Users can revoke access at any time (disconnect button)
- [ ] Clear error messages if something fails
- [ ] Rate limiting prevents excessive API calls
- [ ] Loading states indicate when data is syncing
- [ ] Users understand they must have Google Business Profile access
- [ ] Help/support information is readily available

### 7. Security Implementation
- [ ] OAuth2 flow is properly implemented (authorization code flow)
- [ ] All API calls use HTTPS (never HTTP in production)
- [ ] Client secrets are never exposed to frontend
- [ ] Tokens are stored securely on backend only
- [ ] Token expiration is handled properly
- [ ] Refresh tokens are used to obtain new access tokens
- [ ] Request signing/verification is implemented if required
- [ ] Rate limiting prevents abuse
- [ ] Input validation on all user inputs
- [ ] SQL injection prevention (using parameterized queries)
- [ ] CSRF protection is enabled

### 8. Sensitive Scope Justification
If your app uses sensitive scopes, prepare to explain:
- [ ] Why you need each scope
- [ ] How the data will be used
- [ ] How the data will be protected
- [ ] Who will have access to the data
- [ ] How long the data will be retained

Example justification:
"We request the 'business.manage' scope to allow salon owners to view and respond to Google reviews within our booking platform. This centralizes their review management with their appointment scheduling, improving efficiency. Data is encrypted and only accessible to the business owner who authenticated with Google."

### 9. Test Case Documentation
Prepare test cases that demonstrate:
- [ ] Successful OAuth connection flow
- [ ] Viewing reviews in the application
- [ ] Creating a response to a review
- [ ] Publishing a response to Google
- [ ] Viewing review statistics
- [ ] Syncing reviews from Google
- [ ] Properly handling errors (e.g., network failure, invalid token)
- [ ] Disconnecting and re-connecting to Google

### 10. Verification & Testing
- [ ] Test with test Google account (from OAuth consent screen)
- [ ] Verify all scopes are actually used (no extra permissions)
- [ ] Test error scenarios:
  - [ ] Token expiration
  - [ ] Network timeout
  - [ ] Invalid credentials
  - [ ] Permission denied
  - [ ] Rate limit exceeded
- [ ] Verify data is not shared with third parties
- [ ] Verify no data is logged to external services
- [ ] Test on multiple devices/browsers
- [ ] Verify HTTPS is enforced in production

### 11. Documentation & Support
- [ ] Help documentation explains how to connect to Google
- [ ] Help documentation explains how to manage reviews
- [ ] Help documentation explains privacy implications
- [ ] Support contact is provided and monitored
- [ ] FAQ answers common questions
- [ ] Error messages include helpful troubleshooting steps

### 12. Policy Compliance
- [ ] No spamming or automated review generation
- [ ] No hiding, suppressing, or deleting reviews programmatically
- [ ] No filtering reviews based on rating without user request
- [ ] No incentivizing reviews
- [ ] No violating Google's API terms of service
- [ ] No storing or using review data outside the declared purpose
- [ ] No sharing review data with non-affiliated third parties
- [ ] Compliance with Google Business Profile policies

### 13. Restricted Use Cases to AVOID
- [ ] Do NOT automatically post reviews on behalf of users
- [ ] Do NOT use reviews to identify individuals without consent
- [ ] Do NOT resell or share reviews with competitors
- [ ] Do NOT use reviews to target ads
- [ ] Do NOT modify review content before displaying
- [ ] Do NOT hide negative reviews programmatically
- [ ] Do NOT prevent users from accessing their reviews on Google

## Submission Process

### 1. Navigate to Google API Console
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Go to "APIs & Services" > "OAuth consent screen"

### 2. Configure Consent Screen
- [ ] Application type: Select "External" (most common)
- [ ] Fill in all required fields
- [ ] Add your logo
- [ ] Add authorized domains
- [ ] Provide support email

### 3. Submit for Verification
- [ ] Click "Submit for Verification" when your consent screen is complete
- [ ] Google will review your application (typically 1-3 business days)
- [ ] You'll receive an email with approval or required changes

### 4. Addressing Feedback
If Google requests changes:
- [ ] Review the feedback carefully
- [ ] Make required changes to your app
- [ ] Update documentation if needed
- [ ] Respond to Google with a summary of changes
- [ ] Request re-review

## Common Rejection Reasons & Prevention

### ❌ Scope Issues
- Requesting more scopes than needed
- **Fix**: Only request `business.manage` and user info scopes

### ❌ Misleading Consent Screen
- Consent screen doesn't match what app does
- **Fix**: Provide clear, accurate descriptions

### ❌ Inadequate Data Protection
- No mention of data security in privacy policy
- **Fix**: Detail how data is encrypted, stored, and protected

### ❌ Suspicious Data Usage
- Plan to share reviews with third parties
- **Fix**: Only use data for the stated single purpose

### ❌ Privacy Policy Issues
- No privacy policy or link broken
- **Fix**: Publish a clear, comprehensive privacy policy

### ❌ App Not Functional
- Can't verify the app works
- **Fix**: Ensure smooth OAuth flow and core functionality

### ❌ Terms of Service Issues
- No terms or violates Google policies
- **Fix**: Create terms that align with Google's policies

## Post-Approval Steps

Once approved:
- [ ] Deploy to production
- [ ] Monitor API quota usage and optimize if needed
- [ ] Set up alerts for quota issues
- [ ] Regularly review Google API documentation for updates
- [ ] Maintain compliance with policies
- [ ] Update privacy policy if data handling changes
- [ ] Monitor user feedback and error rates
- [ ] Plan for feature enhancements

## Important Links

- [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
- [My Business API Documentation](https://developers.google.com/my-business)
- [OAuth 2.0 Best Practices](https://tools.ietf.org/html/draft-ietf-oauth-security-topics)
- [Google API Console](https://console.cloud.google.com/)
- [Google Cloud Support](https://cloud.google.com/support)

## Timeline Expectations

- **Setup**: 1-2 hours
- **Development**: 2-3 days
- **Testing**: 1-2 days
- **Google Review**: 1-3 business days
- **Feedback Resolution**: 1-7 days per iteration
- **Total**: 1-3 weeks from start to production

## Quick Checklist for Final Review

Before submitting to Google, verify:

```bash
✓ OAuth consent screen is complete and accurate
✓ Only requesting necessary scopes
✓ Privacy policy is comprehensive
✓ Terms of service are in place
✓ All test cases pass
✓ Error handling is robust
✓ Data is securely encrypted
✓ Users can disconnect anytime
✓ No automated review creation
✓ No review filtering/hiding
✓ No third-party data sharing
✓ HTTPS in production
✓ Support contact available
✓ Documentation is clear
```

## Notes for Your Submission

For your Booking Platform submission, emphasize:

1. **Purpose**: "Review management tool for salon and service businesses"
2. **Scope**: "Only access reviews and enables professional responses"
3. **Security**: "Enterprise-level encryption and secure token handling"
4. **Privacy**: "Users maintain full control - can disconnect anytime"
5. **Compliance**: "Zero automated review manipulation - full transparency"

Good luck with your submission! 🚀
