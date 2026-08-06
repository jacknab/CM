import React from "react";
import { QRCodeCanvas } from "qrcode.react";

interface QRCodeProps {
  value: string;
  size?: number;
  className?: string;
}

export const QRCodeImage: React.FC<QRCodeProps> = ({ value, size = 128, className }) => {
  return <QRCodeCanvas value={value} size={size} className={className} />;
};
