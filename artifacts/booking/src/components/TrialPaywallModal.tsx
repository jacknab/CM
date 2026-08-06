import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Crown, CreditCard } from 'lucide-react';

interface TrialPaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade?: () => void;
}

export const TrialPaywallModal: React.FC<TrialPaywallModalProps> = ({
  isOpen,
  onClose,
  onUpgrade
}) => {
  const handleUpgrade = () => {
    if (onUpgrade) {
      onUpgrade();
    } else {
      // Navigate to billing page or open upgrade flow
      window.location.href = '/manage/billing';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-orange-600" />
          </div>
          <DialogTitle className="text-xl font-semibold text-gray-900">
            Your free trial has ended
          </DialogTitle>
          <DialogDescription className="text-gray-600 mt-2">
            Upgrade your account to continue accepting bookings and managing your business.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6 space-y-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <Crown className="w-5 h-5 text-yellow-600" />
              <div>
                <h4 className="font-medium text-gray-900">Unlock Premium Features</h4>
                <p className="text-sm text-gray-600">
                  Continue creating appointments, managing clients, and growing your business
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col space-y-3">
            <Button 
              onClick={handleUpgrade}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              <CreditCard className="w-4 h-4 mr-2" />
              Upgrade Now
            </Button>
            
            <Button 
              variant="outline" 
              onClick={onClose}
              className="w-full"
            >
              Maybe Later
            </Button>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            Need help? Contact our support team for assistance.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
