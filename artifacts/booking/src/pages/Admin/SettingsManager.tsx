import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Settings, Save, RefreshCw } from 'lucide-react';

interface SystemSettings {
  freeTrialDays: number;
}

export const SettingsManager: React.FC = () => {
  const [settings, setSettings] = useState<SystemSettings>({
    freeTrialDays: 14
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      // For now, use default values. In a real implementation, fetch from API
      setSettings({ freeTrialDays: 14 });
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setMessage(null);

    try {
      // Validate input
      if (settings.freeTrialDays < 0 || settings.freeTrialDays > 365) {
        setMessage({ type: 'error', text: 'Free trial days must be between 0 and 365' });
        return;
      }

      setMessage({ type: 'success', text: 'Settings saved successfully!' });
      
      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-[#E0E0E0] text-gray-800 font-sans text-xs select-none overflow-hidden">
        <div className="bg-[#2D3E50] text-white p-1 flex justify-between items-center shadow-md">
          <div className="flex items-center space-x-4 ml-2">
            <Settings className="w-4 h-4" />
            <span className="text-sm font-bold uppercase tracking-wider">Admin Settings</span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#E0E0E0] text-gray-800 font-sans text-xs select-none overflow-hidden">
      {/* Header Bar */}
      <div className="bg-[#2D3E50] text-white p-1 flex justify-between items-center shadow-md">
        <div className="flex items-center space-x-4 ml-2">
          <Settings className="w-4 h-4" />
          <span className="text-sm font-bold uppercase tracking-wider">Admin Settings</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-4 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Trial Settings */}
          <Card className="border border-gray-300 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-[#2D3E50] flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Trial Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="freeTrialDays" className="text-sm font-medium">
                  Free Trial Days
                </Label>
                <Input
                  id="freeTrialDays"
                  type="number"
                  min="0"
                  max="365"
                  value={settings.freeTrialDays}
                  onChange={(e) => setSettings({ ...settings, freeTrialDays: parseInt(e.target.value) || 0 })}
                  className="w-32"
                />
                <p className="text-xs text-gray-500">
                  Number of days new users receive for a free trial. Set to 0 to disable trials.
                </p>
              </div>

              {message && (
                <Alert className={message.type === 'success' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
                  <AlertDescription className={message.type === 'success' ? 'text-green-800' : 'text-red-800'}>
                    {message.text}
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2 pt-4">
                <Button 
                  onClick={saveSettings}
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? 'Saving...' : 'Save Settings'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={fetchSettings}
                  disabled={saving}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Information Card */}
          <Card className="border border-gray-300 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-[#2D3E50]">
                System Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Trial System Configuration</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Current free trial duration: <strong>{settings.freeTrialDays} days</strong></li>
                  <li>• Trials apply only to new user registrations</li>
                  <li>• Existing users maintain active subscription status</li>
                  <li>• Trial expiration is validated server-side</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Future Integration Points</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Stripe billing integration ready</li>
                  <li>• Support for monthly/annual plans</li>
                  <li>• Coupon and discount system compatible</li>
                  <li>• Feature-tier pricing architecture</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
