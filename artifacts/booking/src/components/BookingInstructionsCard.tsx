import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Instagram, Facebook } from "lucide-react";

interface BookingInstructionsCardProps {
  platform: "Google" | "Instagram" | "Facebook";
  onOpen: () => void;
}

const GoogleLogo = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

const InstagramLogo = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" xmlns="http://www.w3.org/2000/svg">
    <path d="M7.8,2H16.2C19.4,2 22,4.6 22,7.8V16.2A5.8,5.8 0 0,1 16.2,22H7.8C4.6,22 2,19.4 2,16.2V7.8A5.8,5.8 0 0,1 7.8,2M7.6,4A3.6,3.6 0 0,0 4,7.6V16.4C4,18.39 5.61,20 7.6,20H16.4A3.6,3.6 0 0,0 20,16.4V7.6C20,5.61 18.39,4 16.4,4H7.6M12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M19,5A1,1 0 0,1 20,6A1,1 0 0,1 19,7A1,1 0 0,1 18,6A1,1 0 0,1 19,5Z" fill="white" />
  </svg>
);

const FacebookLogo = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2.04C6.5 2.04 2 6.53 2 12.06C2 17.06 5.66 21.21 10.44 21.96V14.96H7.9V12.06H10.44V9.85C10.44 7.34 11.93 5.96 14.15 5.96C15.21 5.96 16.12 6.04 16.12 6.04V8.51H15.01C13.77 8.51 13.38 9.28 13.38 10.07V12.06H16.15L15.71 14.96H13.38V21.96C18.16 21.21 21.82 17.06 21.82 12.06C21.82 6.53 17.32 2.04 12 2.04Z" fill="white" />
  </svg>
);

const platformInfo = {
  Google: {
    title: "Booking Link via Google",
    description: "Add your Certxa booking link to your Google Business Profile",
    icon: <GoogleLogo />,
    bg: "bg-white border border-gray-100",
  },
  Instagram: {
    title: "Instagram Booking Link",
    description: "Accept bookings from your Instagram profile",
    icon: <InstagramLogo />,
    bg: "bg-gradient-to-tr from-[#f09433] via-[#bc1888] to-[#cc2366]",
  },
  Facebook: {
    title: "Facebook Booking Link",
    description: "Accept bookings from your Facebook page",
    icon: <FacebookLogo />,
    bg: "bg-[#1877F2]",
  },
};

export const BookingInstructionsCard: React.FC<BookingInstructionsCardProps> = ({ platform, onOpen }) => {
  const info = platformInfo[platform];
  return (
    <Card className="p-4 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${info.bg}`}>
        {info.icon}
      </div>
      <div className="flex-1">
        <div className="font-semibold text-md mb-1">{info.title}</div>
        <div className="text-sm text-muted-foreground mb-2">{info.description}</div>
        <Button variant="ghost" onClick={onOpen} className="p-0 h-auto text-primary hover:text-primary/80 hover:bg-transparent font-medium">Generate link</Button>
      </div>
    </Card>
  );
};
