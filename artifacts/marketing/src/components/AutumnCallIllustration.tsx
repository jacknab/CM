import { useEffect, useRef } from 'react';
import type React from 'react';
import { CSS, MARKUP, start } from './autumn-call-illustration';

/**
 * The animated phone call from the previous Autumn page: an incoming call
 * that Autumn answers, with the conversation appearing beside the phone.
 */
export default function AutumnCallIllustration({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    return start(ref.current);
  }, []);

  return (
    // The copied styles use two colours the previous site defined as variables.
    <div className={className} style={{ '--plum': '#3B0764', '--violet': '#6D28D9' } as React.CSSProperties}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div ref={ref} dangerouslySetInnerHTML={{ __html: MARKUP }} />
    </div>
  );
}
