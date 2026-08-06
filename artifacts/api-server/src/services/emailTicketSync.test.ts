/**
 * emailTicketSync.test.ts
 *
 * Tests for the email body normalisation pipeline:
 *   stripHtml · normalizePlainText · removeQuotedReplies · removeSignature
 *
 * Each test validates that the stored ticket body looks as if the customer
 * typed the message directly into the support form — no email formatting
 * artifacts, no excessive blank lines, no quoted reply history.
 */

import { describe, it, expect } from "vitest";
import {
  stripHtml,
  normalizePlainText,
  removeQuotedReplies,
  removeSignature,
} from "./emailTicketSync";

// ---------------------------------------------------------------------------
// stripHtml
// ---------------------------------------------------------------------------

describe("stripHtml", () => {
  it("removes <style> blocks entirely", () => {
    const html = `<style>.foo { color: red; }</style><p>Hello</p>`;
    expect(stripHtml(html)).toBe("Hello");
  });

  it("removes <script> blocks entirely", () => {
    const html = `<script>alert('x')</script><p>Hello</p>`;
    expect(stripHtml(html)).toBe("Hello");
  });

  it("removes <head> blocks entirely", () => {
    const html = `<head><title>Email</title><style>.x{}</style></head><body><p>Body text</p></body>`;
    expect(stripHtml(html)).toBe("Body text");
  });

  it("converts block elements to newlines preserving paragraph structure", () => {
    const html = `<p>First paragraph</p><p>Second paragraph</p>`;
    const result = stripHtml(html);
    expect(result).toContain("First paragraph");
    expect(result).toContain("Second paragraph");
    // Paragraphs should be separated by at most one blank line
    expect(result).not.toMatch(/\n{3,}/);
  });

  it("collapses multiple consecutive <br> tags into a single newline", () => {
    const html = `<p>Line one</p><br><br><br><p>Line two</p>`;
    const result = stripHtml(html);
    expect(result).not.toMatch(/\n{3,}/);
    expect(result).toContain("Line one");
    expect(result).toContain("Line two");
  });

  it("removes empty <div></div> elements", () => {
    const html = `<div>Hello</div><div></div><div>World</div>`;
    const result = stripHtml(html);
    expect(result).not.toMatch(/\n{3,}/);
    expect(result).toContain("Hello");
    expect(result).toContain("World");
  });

  it("removes empty <p></p> elements", () => {
    const html = `<p>Hello Support,</p><p></p><p>I need help.</p>`;
    const result = stripHtml(html);
    expect(result).not.toMatch(/\n{3,}/);
    expect(result).toContain("Hello Support,");
    expect(result).toContain("I need help.");
  });

  it("removes inline style attributes", () => {
    const html = `<p style="font-size:14px;color:#333;">Styled text</p>`;
    expect(stripHtml(html)).toBe("Styled text");
  });

  it("removes elements with display:none", () => {
    const html = `<div style="display:none">Hidden content</div><p>Visible content</p>`;
    const result = stripHtml(html);
    expect(result).not.toContain("Hidden content");
    expect(result).toContain("Visible content");
  });

  it("removes elements with visibility:hidden", () => {
    const html = `<span style="visibility:hidden">Secret</span><p>Normal text</p>`;
    const result = stripHtml(html);
    expect(result).not.toContain("Secret");
    expect(result).toContain("Normal text");
  });

  it("decodes HTML entities", () => {
    const html = `<p>AT&amp;T &lt;test&gt; &quot;quotes&quot; &apos;apos&apos; &nbsp;space</p>`;
    const result = stripHtml(html);
    expect(result).toContain("AT&T");
    expect(result).toContain("<test>");
    expect(result).toContain('"quotes"');
  });

  it("decodes numeric HTML entities", () => {
    const html = `<p>&#169; Copyright &#8211; dash</p>`;
    const result = stripHtml(html);
    expect(result).toContain("©");
    expect(result).toContain("–");
  });

  it("does not produce 3+ consecutive blank lines", () => {
    const html = `<p>A</p><p></p><p></p><p></p><p>B</p>`;
    expect(stripHtml(html)).not.toMatch(/\n{3,}/);
  });

  it("preserves bullet list content", () => {
    const html = `<ul><li>Item one</li><li>Item two</li><li>Item three</li></ul>`;
    const result = stripHtml(html);
    expect(result).toContain("Item one");
    expect(result).toContain("Item two");
    expect(result).toContain("Item three");
  });

  it("handles Gmail-style HTML email", () => {
    const html = `
      <div dir="ltr">Hello Support,<br><br>
      I need help with my account.<br><br>
      Thank you<br>
      </div>
    `;
    const result = stripHtml(html);
    expect(result).toContain("Hello Support,");
    expect(result).toContain("I need help with my account.");
    expect(result).toContain("Thank you");
    expect(result).not.toMatch(/\n{3,}/);
  });

  it("handles Outlook-style HTML email with heavy inline styles", () => {
    const html = `
      <html><head><style type="text/css">body{font-size:11pt}</style></head>
      <body>
      <p style="margin:0;font-family:Calibri,sans-serif;font-size:11pt">Hello,</p>
      <p style="margin:0">&nbsp;</p>
      <p style="margin:0;font-family:Calibri,sans-serif">I would like to cancel my subscription.</p>
      <p style="margin:0">&nbsp;</p>
      <p style="margin:0">John</p>
      </body></html>
    `;
    const result = stripHtml(html);
    expect(result).toContain("Hello,");
    expect(result).toContain("I would like to cancel my subscription.");
    expect(result).toContain("John");
    expect(result).not.toMatch(/\n{3,}/);
  });

  it("handles Apple Mail HTML email", () => {
    const html = `
      <html><body style="word-wrap:break-word;-webkit-nbsp-mode:space">
      <div>Hi there,</div>
      <div><br></div>
      <div>Can you help me reset my password?</div>
      <div><br></div>
      <div>Thanks</div>
      </body></html>
    `;
    const result = stripHtml(html);
    expect(result).toContain("Hi there,");
    expect(result).toContain("Can you help me reset my password?");
    expect(result).toContain("Thanks");
    expect(result).not.toMatch(/\n{3,}/);
  });
});

// ---------------------------------------------------------------------------
// normalizePlainText
// ---------------------------------------------------------------------------

describe("normalizePlainText", () => {
  it("normalises \\r\\n to \\n", () => {
    const text = "Hello\r\nWorld";
    expect(normalizePlainText(text)).toBe("Hello\nWorld");
  });

  it("normalises bare \\r to \\n", () => {
    const text = "Hello\rWorld";
    expect(normalizePlainText(text)).toBe("Hello\nWorld");
  });

  it("converts tabs to spaces", () => {
    const text = "Hello\tWorld";
    expect(normalizePlainText(text)).toBe("Hello World");
  });

  it("removes trailing spaces from each line", () => {
    const text = "Hello   \nWorld   ";
    const result = normalizePlainText(text);
    expect(result).toBe("Hello\nWorld");
  });

  it("collapses three or more blank lines into one", () => {
    const text = "Hello\n\n\n\n\nWorld";
    const result = normalizePlainText(text);
    expect(result).toBe("Hello\n\nWorld");
  });

  it("preserves a single intentional blank line between paragraphs", () => {
    const text = "Paragraph one.\n\nParagraph two.";
    expect(normalizePlainText(text)).toBe("Paragraph one.\n\nParagraph two.");
  });

  it("matches the spec example: before → after", () => {
    const before = "Hello Support,\n\n\nI need help with my account.\n\n\n\nThank you";
    const after  = "Hello Support,\n\nI need help with my account.\n\nThank you";
    expect(normalizePlainText(before)).toBe(after);
  });

  it("trims leading and trailing whitespace", () => {
    const text = "\n\n  Hello  \n\n";
    expect(normalizePlainText(text)).toBe("Hello");
  });
});

// ---------------------------------------------------------------------------
// removeQuotedReplies
// ---------------------------------------------------------------------------

describe("removeQuotedReplies", () => {
  it("cuts at Gmail 'On [date] ... wrote:' pattern", () => {
    const text = [
      "I need help with my account.",
      "",
      "On Mon, Jul 19, 2026 at 10:30 AM Support Team <support@certxa.com> wrote:",
      "> Thanks for reaching out.",
      "> We will get back to you soon.",
    ].join("\n");
    const result = removeQuotedReplies(text);
    expect(result).toBe("I need help with my account.");
    expect(result).not.toContain("wrote:");
    expect(result).not.toContain(">");
  });

  it("cuts at Outlook '-----Original Message-----' separator", () => {
    const text = [
      "Please help me.",
      "",
      "-----Original Message-----",
      "From: support@certxa.com",
      "Subject: Re: Account issue",
      "",
      "Previous reply here.",
    ].join("\n");
    const result = removeQuotedReplies(text);
    expect(result).toBe("Please help me.");
  });

  it("cuts at '-----Forwarded Message-----' separator", () => {
    const text = [
      "Please see below.",
      "",
      "-----Forwarded Message-----",
      "From: someone@example.com",
    ].join("\n");
    expect(removeQuotedReplies(text)).toBe("Please see below.");
  });

  it("cuts at Outlook inline reply header block (From / Sent / To / Subject)", () => {
    const text = [
      "Hello,",
      "",
      "I have a question.",
      "",
      "From: John Smith <john@example.com>",
      "Sent: Monday, July 19, 2026 9:00 AM",
      "To: support@certxa.com",
      "Subject: Account question",
      "",
      "Previous message content.",
    ].join("\n");
    const result = removeQuotedReplies(text);
    expect(result).toContain("I have a question.");
    expect(result).not.toContain("Sent: Monday");
    expect(result).not.toContain("Previous message content.");
  });

  it("cuts at '>' quoted lines", () => {
    const text = [
      "My follow-up question.",
      "",
      "> Original message content here.",
      "> More original content.",
    ].join("\n");
    expect(removeQuotedReplies(text)).toBe("My follow-up question.");
  });

  it("cuts at underline separators (____…)", () => {
    const text = [
      "My message.",
      "",
      "_____________________________",
      "From: other@example.com",
    ].join("\n");
    expect(removeQuotedReplies(text)).toBe("My message.");
  });

  it("does not cut body that mentions 'From:' without a reply header block nearby", () => {
    // A sentence starting with "From" in the body should not be mistaken for a header
    const text = "From what I can see, the issue started yesterday.";
    // Should NOT cut anything because there's no @-address on the From: line
    expect(removeQuotedReplies(text)).toBe(text);
  });

  it("preserves the full body when there is no quoted history", () => {
    const text = "Hello Support,\n\nI need help.\n\nThank you";
    expect(removeQuotedReplies(text)).toBe(text);
  });

  it("handles Apple Mail reply chain format", () => {
    const text = [
      "Can you check again?",
      "",
      "On Jul 19, 2026, at 9:00 AM, Certxa Support <support@certxa.com> wrote:",
      "",
      "> We investigated your issue.",
    ].join("\n");
    expect(removeQuotedReplies(text)).toBe("Can you check again?");
  });
});

// ---------------------------------------------------------------------------
// removeSignature
// ---------------------------------------------------------------------------

describe("removeSignature", () => {
  it("removes content after '-- ' signature separator", () => {
    const text = "I need help.\n\n-- \nJohn Doe\njohn@example.com\n+1 555 0100";
    expect(removeSignature(text)).toBe("I need help.");
  });

  it("removes content after 'Sent from my iPhone'", () => {
    const text = "Please look into this.\n\nSent from my iPhone";
    expect(removeSignature(text)).toBe("Please look into this.");
  });

  it("removes content after 'Get Outlook for iOS'", () => {
    const text = "I need a refund.\n\nGet Outlook for iOS";
    expect(removeSignature(text)).toBe("I need a refund.");
  });

  it("removes content after 'Best regards,'", () => {
    const text = "My account is broken.\n\nBest regards,\nJane Smith";
    expect(removeSignature(text)).toBe("My account is broken.");
  });

  it("removes content after 'Kind regards,'", () => {
    const text = "Please help.\n\nKind regards,\nAlex";
    expect(removeSignature(text)).toBe("Please help.");
  });

  it("removes content after 'Thanks,'", () => {
    const text = "Why is my invoice wrong?\n\nThanks,\nBob";
    expect(removeSignature(text)).toBe("Why is my invoice wrong?");
  });

  it("removes content after 'Regards,'", () => {
    const text = "I have a billing question.\n\nRegards,\nSarah";
    expect(removeSignature(text)).toBe("I have a billing question.");
  });

  it("does not strip if truncated result would be too short", () => {
    // If the body before the sig marker is < 5 chars, keep the original
    const text = "Hi\n\nThanks,\nBob";
    // "Hi" is 2 chars — below the 5-char minimum so sig should not be stripped
    expect(removeSignature(text)).toBe(text);
  });

  it("preserves the full body when there is no signature", () => {
    const text = "Hello, I need help with my account please.";
    expect(removeSignature(text)).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// Full pipeline integration tests (simulate real emails)
// ---------------------------------------------------------------------------

describe("full pipeline integration", () => {
  /**
   * Helper that runs the full cleanBody pipeline inline so these tests
   * don't depend on the ParsedMail type (which requires IMAP setup).
   */
  function pipeline(input: { html?: string; text?: string }): string {
    let body = "";
    if (input.html) {
      body = stripHtml(input.html);
    } else if (input.text) {
      if (/<[a-z][^>]{0,100}>/i.test(input.text)) {
        body = stripHtml(input.text);
      } else {
        body = normalizePlainText(input.text);
      }
    }
    body = removeQuotedReplies(body);
    body = removeSignature(body);
    body = body.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
    body = body.replace(/\n{3,}/g, "\n\n").trim();
    return body;
  }

  it("Gmail HTML email with reply chain", () => {
    const html = `
      <div dir="ltr">
        <div>Hello,</div>
        <div><br></div>
        <div>I can&#39;t log into my account.</div>
        <div><br></div>
        <div>Thanks</div>
      </div>
      <br>
      <div class="gmail_quote">
        <div dir="ltr" class="gmail_attr">On Mon, Jul 19, 2026 at 10:00 AM Support &lt;support@certxa.com&gt; wrote:<br></div>
        <blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px #ccc solid;padding-left:1ex">
          Please try resetting your password.
        </blockquote>
      </div>
    `;
    const result = pipeline({ html });
    expect(result).toContain("Hello,");
    expect(result).toContain("I can't log into my account.");
    expect(result).not.toContain("Please try resetting");
    expect(result).not.toMatch(/\n{3,}/);
  });

  it("Outlook HTML email with heavy formatting and inline reply", () => {
    const html = `
      <html>
      <head><meta http-equiv="Content-Type" content="text/html; charset=utf-8">
      <style type="text/css">body{font-family:Calibri,Helvetica,sans-serif}</style></head>
      <body>
      <p style="font-family:Calibri,Helvetica,sans-serif;font-size:14pt;color:#1F3864">Hi,</p>
      <p style="font-family:Calibri,Helvetica,sans-serif;font-size:14pt">I would like to update my billing information.</p>
      <p style="font-family:Calibri,Helvetica,sans-serif;font-size:14pt">John</p>
      <hr style="display:inline-block;width:98%">
      <div id="divRplyFwdMsg">
      <p><b>From:</b> Certxa Support &lt;support@certxa.com&gt;<br>
      <b>Sent:</b> Monday, July 19, 2026 9:00 AM<br>
      <b>To:</b> John Smith &lt;john@example.com&gt;<br>
      <b>Subject:</b> Re: Billing update</p>
      <p>Please visit your account settings page.</p>
      </div>
      </body>
      </html>
    `;
    const result = pipeline({ html });
    expect(result).toContain("Hi,");
    expect(result).toContain("I would like to update my billing information.");
    expect(result).not.toMatch(/\n{3,}/);
  });

  it("Apple Mail HTML with preformatted blockquote reply", () => {
    const html = `
      <html><body>
      <div style="font-family:-apple-system,sans-serif">
        <p>I already sent the payment but still see a balance.</p>
        <p>Please check again.</p>
      </div>
      <br>
      <blockquote type="cite">
        <div>On Jul 19, 2026, at 8:45 AM, Support &lt;support@certxa.com&gt; wrote:</div>
        <br>
        <div>We see a balance due on your account.</div>
      </blockquote>
      </body></html>
    `;
    const result = pipeline({ html });
    expect(result).toContain("I already sent the payment");
    expect(result).toContain("Please check again.");
    expect(result).not.toMatch(/\n{3,}/);
  });

  it("plain text email with excessive blank lines (spec example)", () => {
    const text =
      "Hello Support,\n\n\nI need help with my account.\n\n\n\nThank you";
    const result = pipeline({ text });
    expect(result).toBe(
      "Hello Support,\n\nI need help with my account.\n\nThank you"
    );
  });

  it("plain text email with Outlook reply headers", () => {
    const text = [
      "Hello,",
      "",
      "My question is about the last invoice.",
      "",
      "From: support@certxa.com",
      "Sent: Sunday, July 18, 2026 5:00 PM",
      "To: customer@example.com",
      "Subject: Re: Invoice question",
      "",
      "Please see your dashboard for invoice details.",
    ].join("\n");
    const result = pipeline({ text });
    expect(result).toContain("My question is about the last invoice.");
    expect(result).not.toContain("Sent: Sunday");
  });

  it("plain text email with signature", () => {
    const text = [
      "I need help resetting my password.",
      "",
      "Best regards,",
      "Jane Doe",
      "jane@example.com",
      "+1 555 0199",
    ].join("\n");
    const result = pipeline({ text });
    expect(result).toBe("I need help resetting my password.");
  });

  it("plain text email with CRLF line endings", () => {
    const text = "Hello Support,\r\n\r\nI need help.\r\n\r\nThank you";
    const result = pipeline({ text });
    expect(result).toBe("Hello Support,\n\nI need help.\n\nThank you");
  });

  it("email with signature AND reply chain — removes both", () => {
    const text = [
      "Any update on this?",
      "",
      "Thanks,",
      "Bob Smith",
      "bob@example.com",
      "",
      "On Mon, Jul 19, 2026 at 9:00 AM Support <support@certxa.com> wrote:",
      "> We are looking into it.",
    ].join("\n");
    const result = pipeline({ text });
    expect(result).toBe("Any update on this?");
  });
});
