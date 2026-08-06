import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/hooks/use-language";
import {
  Search,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  Calendar,
  Users,
  Scissors,
  ShoppingBag,
  Globe,
  CreditCard,
  BarChart3,
  MessageSquare,
  Star,
  Clock,
  HelpCircle,
  BookOpen,
  Zap,
  Settings,
  UserCircle,
  Banknote,
  Bell,
  Shield,
  ListOrdered,
  Megaphone,
  FileText,
  Mail,
  MapPin,
  ClipboardList,
  ExternalLink,
  Brain,
  Phone,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Article = {
  question: string;
  answer: string | ReactNode;
};

type Section = {
  id: string;
  icon: typeof LayoutDashboard;
  title: string;
  color: string;
  description: string;
  articles: Article[];
};

const sections: Section[] = [
  {
    id: "getting-started",
    icon: Zap,
    title: "Getting Started",
    color: "text-amber-600",
    description: "Set up your account and get running in minutes.",
    articles: [
      {
        question: "How do I set up my business for the first time?",
        answer:
          "After registering, go to Business Settings to enter your business name, address, hours, and contact details. Then add your Services, followed by your Team members. Finally, configure your Online Booking page so clients can start booking you right away.",
      },
      {
        question: "How do I invite staff members?",
        answer:
          "Go to Team in the sidebar. Click Invite Staff and enter their email address. They'll receive an invitation email with a link to set up their password. You can assign them a role (Owner, Manager, Staff) and configure their permissions under Roles & Permissions.",
      },
      {
        question: "What's the difference between Owner, Manager, and Staff roles?",
        answer:
          "Owner has full access to everything including billing and business settings. Manager can manage appointments, clients, services, and staff but cannot access billing. Staff can only view and manage their own appointments and assigned clients, depending on the permissions you configure.",
      },
      {
        question: "How do I set my business hours?",
        answer:
          "Go to Business Settings → Hours. Set your open/close times for each day of the week. Toggle days off for days you're closed. These hours control when clients can book online and when the calendar shows available slots.",
      },
      {
        question: "Can I use Certxa on mobile?",
        answer:
          "Yes. The dashboard is fully mobile-responsive and works in any modern browser on iOS or Android. For the best experience add it to your home screen: on iOS tap Share → Add to Home Screen; on Android tap the browser menu → Add to Home Screen.",
      },
    ],
  },
  {
    id: "calendar",
    icon: Calendar,
    title: "Calendar & Appointments",
    color: "text-blue-600",
    description: "Manage your schedule, book appointments, and handle your calendar.",
    articles: [
      {
        question: "How do I create a new appointment?",
        answer:
          "Click any empty time slot on the Calendar, or click the + New button. Select the client (or create one on the spot), choose the service, assign a staff member, confirm the date and time, and click Save. The client will automatically receive a confirmation notification if SMS/email notifications are enabled.",
      },
      {
        question: "How do I reschedule or edit an appointment?",
        answer:
          "Click the appointment on the calendar to open it. Click Edit, change the date, time, service, or staff member, then Save. The client will receive an automatic reschedule notification if enabled.",
      },
      {
        question: "How do I cancel an appointment?",
        answer:
          "Open the appointment and click Cancel Appointment. You can optionally send a cancellation message to the client. Cancelled appointments are tracked in Reports so you can monitor your cancellation rate.",
      },
      {
        question: "What are buffer times and how do I use them?",
        answer:
          "Buffer times add automatic gaps between appointments — for example 15 minutes of cleanup time after every haircut. Set them per service under Services → Edit Service → Buffer Time. The calendar will block that time after the appointment automatically.",
      },
      {
        question: "Can I block off time on the calendar?",
        answer:
          "Yes. Click any time slot and choose Block Time. Add a label like 'Lunch' or 'Staff Meeting', set the duration, and save. Blocked time won't be available for online bookings.",
      },
      {
        question: "How do I set staff schedules and time off?",
        answer:
          "Go to Team → click a staff member → Schedule. Set their working hours per day. For time off, go to Calendar Settings → Time Off and add dates. The staff member won't be bookable during those times.",
      },
      {
        question: "How does the color coding on the calendar work?",
        answer:
          "Each appointment is color-coded by status: Green = Confirmed, Yellow = Pending, Blue = Checked In, Gray = Completed, Red = Cancelled. You can also assign custom colors to individual staff members in their profile.",
      },
      {
        question: "Can I view multiple staff members' schedules at once?",
        answer:
          "Yes. The calendar has a multi-staff view. Use the staff filter at the top of the calendar to select which team members to display. Each staff member gets their own column.",
      },
    ],
  },
  {
    id: "clients",
    icon: Users,
    title: "Clients & CRM",
    color: "text-green-600",
    description: "Manage your client database, history, and relationships.",
    articles: [
      {
        question: "How do I add a new client?",
        answer:
          "Go to Clients and click Add Client. Enter their name, phone number, email, and any notes. You can also create clients on the fly when booking an appointment — just type their name and choose Create New Client.",
      },
      {
        question: "What information is stored in a client profile?",
        answer:
          "Each client profile includes: contact details, appointment history, total spend, visit frequency, notes, intake form responses, loyalty points balance, SMS conversation history, and any photos or files you attach. It's your complete record for that client.",
      },
      {
        question: "How do I add notes to a client?",
        answer:
          "Open the client's profile and click the Notes tab. Add private notes visible only to staff — things like service preferences, allergies, or special instructions. Notes are date-stamped and attributed to the staff member who wrote them.",
      },
      {
        question: "How does the Waitlist work?",
        answer:
          "The Waitlist lets clients join a queue for a specific service or time slot when you're fully booked. Go to Waitlist in the sidebar to see who's waiting. When a slot opens, click Notify to send them an SMS or email to book. Clients can also join the waitlist themselves through your online booking page.",
      },
      {
        question: "How does the Queue / Walk-in Check-in work?",
        answer:
          "The Queue is a real-time walk-in management system. Clients scan a QR code or visit your check-in URL to add themselves. You'll see their name appear in the Queue dashboard with their wait time. Use this for walk-in businesses or as a front-desk check-in tool.",
      },
      {
        question: "How do I merge duplicate clients?",
        answer:
          "Open one of the duplicate client profiles. Click the Actions menu and select Merge Client. Search for the duplicate and confirm. All appointment history, notes, and loyalty points will be combined into one profile.",
      },
      {
        question: "Can clients fill out intake forms before their appointment?",
        answer:
          "Yes. Create intake forms under Business → Intake Forms. Attach them to specific services. When a client books that service online, they'll be prompted to complete the form. Responses appear on the appointment and in their client profile.",
      },
    ],
  },
  {
    id: "services",
    icon: Scissors,
    title: "Services & Pricing",
    color: "text-purple-600",
    description: "Set up the services you offer, pricing, and duration.",
    articles: [
      {
        question: "How do I add a new service?",
        answer:
          "Go to Business → Services and click Add Service. Enter the service name, category, duration, price, and which staff members can perform it. You can also add a description that appears on your online booking page.",
      },
      {
        question: "Can I offer services at different prices for different staff?",
        answer:
          "Yes. When editing a service, you can set a price override per staff member. For example, a senior stylist might charge more than a junior — set their individual price in the service's Staff Pricing section.",
      },
      {
        question: "What are add-ons?",
        answer:
          "Add-ons are optional extras clients can add to a service when booking — like a deep conditioning treatment with a haircut. Create them under Business → Add-ons and attach them to the relevant services. They appear as checkboxes on your online booking page.",
      },
      {
        question: "How do I create service categories?",
        answer:
          "When adding or editing a service, type a new category name in the Category field or select an existing one. Categories group your services on the online booking page making it easier for clients to find what they want.",
      },
      {
        question: "Can I hide a service from online booking but keep it for internal use?",
        answer:
          "Yes. Edit the service and toggle Off the Online Booking switch. It will still appear when staff create appointments internally but won't be visible to clients booking online.",
      },
      {
        question: "How do I set up packages or memberships?",
        answer:
          "Packages and memberships are managed through the Loyalty Program and billing features. Contact support for custom package configuration if your needs are more complex.",
      },
    ],
  },
  {
    id: "online-booking",
    icon: Globe,
    title: "Online Booking",
    color: "text-sky-600",
    description: "Let clients book themselves 24/7 through your booking page.",
    articles: [
      {
        question: "How do I set up my online booking page?",
        answer:
          "Go to Settings → Online Booking. Enable the toggle at the top, then configure your booking URL slug (e.g. certxa.com/book/your-business), choose which services and staff to show, set advance booking limits, and customize your cancellation policy. Click Save and your booking page is live.",
      },
      {
        question: "Where do clients go to book online?",
        answer:
          "Your booking page URL is shown in Settings → Online Booking. It follows the format: certxa.com/book/your-slug. Share this link on your website, Instagram bio, Google Business profile, and anywhere else clients find you.",
      },
      {
        question: "Can I require a deposit for online bookings?",
        answer:
          "Yes. In Settings → Online Booking, enable Require Deposit and set the amount (fixed dollar amount or percentage). Clients will need to pay the deposit via card when they book. The deposit is credited toward their total at checkout.",
      },
      {
        question: "How do I limit how far in advance clients can book?",
        answer:
          "In Settings → Online Booking, set the Booking Window. For example, set it to 60 days so clients can only book up to 60 days in advance. You can also set a minimum notice period — e.g. clients must book at least 2 hours before the appointment.",
      },
      {
        question: "Can clients cancel or reschedule online?",
        answer:
          "Yes, if you allow it. In Settings → Online Booking, toggle on Allow Online Cancellations and set a cancellation policy window (e.g. must cancel at least 24 hours before). Clients get a link in their confirmation email to manage their appointment.",
      },
      {
        question: "How do I embed the booking widget on my website?",
        answer:
          "In Settings → Online Booking, scroll to the Embed section. Copy the iframe code or the booking button code and paste it into your website's HTML. Clients can book directly without leaving your site.",
      },
      {
        question: "What confirmation does the client receive after booking?",
        answer:
          "Clients receive an email and/or SMS confirmation (depending on your notification settings) with the appointment details, date, time, service, and staff member. The message includes a link to reschedule or cancel if you've enabled that option.",
      },
      {
        question: "How do automated reminders work?",
        answer:
          "Go to Settings → SMS Notifications or Email Notifications. Enable appointment reminders and set the timing — e.g. send a reminder 24 hours before and again 2 hours before. Reminders are sent automatically with no action needed from you or your staff.",
      },
      {
        question: "Can I take payments through the online booking page?",
        answer:
          "Yes. Connect your Stripe account in Business Settings → Payments. Once connected, you can require deposits at booking or charge a no-show fee. Full payment collection at booking is also available.",
      },
    ],
  },
  {
    id: "pos",
    icon: CreditCard,
    title: "Point of Sale & Payments",
    color: "text-emerald-600",
    description: "Check out clients, process payments, and sell products.",
    articles: [
      {
        question: "How do I check out a client after their appointment?",
        answer:
          "From the Calendar, click the completed appointment and select Checkout. Or go to the POS from the sidebar. The services from the appointment are pre-loaded. Add any retail products sold, apply discounts or loyalty points, then select the payment method and complete the sale.",
      },
      {
        question: "What payment methods can I accept?",
        answer:
          "Cash, card (via Stripe), and gift cards. If you use a Stripe card reader you can accept tap, chip, and swipe payments in person. You can split payments across multiple methods — e.g. part cash, part card.",
      },
      {
        question: "How do I apply a discount at checkout?",
        answer:
          "On the checkout screen, click Add Discount. Enter a percentage or fixed dollar amount. You can also create saved discount codes under Business Settings → Discounts for staff to apply by code.",
      },
      {
        question: "How do gift cards work?",
        answer:
          "Go to Gift Cards in the sidebar to issue and manage gift cards. Enter a value and generate a code. The code can be redeemed at checkout by entering it in the Gift Card field. The balance is tracked automatically.",
      },
      {
        question: "How does the Cash Drawer work?",
        answer:
          "Go to Finance → Cash Drawer. Open a drawer session by entering your starting cash amount. Throughout the day, all cash transactions are recorded. At the end of day, count your drawer and close the session — it will show you any discrepancies.",
      },
      {
        question: "Can I issue refunds?",
        answer:
          "Yes. Find the completed appointment or transaction in Reports, open the receipt, and click Refund. For card payments, the refund goes back to the original card. For cash, you'll handle it manually at the drawer.",
      },
      {
        question: "How do I track product sales?",
        answer:
          "Products are added at checkout from the POS screen. Go to Business → Products to manage your retail inventory. Sales reports in Finance → Reports show product revenue broken out from service revenue.",
      },
    ],
  },
  {
    id: "loyalty",
    icon: Star,
    title: "Loyalty Program",
    color: "text-yellow-600",
    description: "Reward your best clients and keep them coming back.",
    articles: [
      {
        question: "How do I set up a loyalty program?",
        answer:
          "Go to Clients → Loyalty Program. Enable the program and configure how points are earned — e.g. 1 point per $1 spent. Set reward tiers and what clients can redeem points for (discounts, free services). Save, and points will start accumulating automatically at checkout.",
      },
      {
        question: "How do clients earn loyalty points?",
        answer:
          "Points are earned automatically when a client is checked out through the POS. The earning rate is based on your configuration (e.g. 1 point per dollar). Points appear on the client's profile and they're notified of their balance.",
      },
      {
        question: "How do clients redeem loyalty points?",
        answer:
          "At checkout, if a client has redeemable points the option will appear in the POS. Staff can apply the points discount with one click. The client's balance updates automatically.",
      },
      {
        question: "Can I manually adjust a client's points?",
        answer:
          "Yes. Open the client's profile, go to the Loyalty tab, and click Adjust Points. Add or subtract points and add a note explaining the adjustment. This is useful for correcting errors or rewarding clients for referrals.",
      },
    ],
  },
  {
    id: "marketing",
    icon: Megaphone,
    title: "Campaigns & Marketing",
    color: "text-pink-600",
    description: "Reach your clients with targeted SMS and email campaigns.",
    articles: [
      {
        question: "How do I send a marketing campaign?",
        answer:
          "Go to Clients → Campaigns and click New Campaign. Choose SMS or Email, write your message, and select your audience — all clients, specific segments (e.g. clients who haven't visited in 60 days), or a manual selection. Schedule it or send immediately.",
      },
      {
        question: "Can I segment my client list for campaigns?",
        answer:
          "Yes. When creating a campaign, use the audience filter to target clients by last visit date, total spend, service type, loyalty tier, or birthday month. This lets you send the right message to the right people.",
      },
      {
        question: "How do automated re-engagement messages work?",
        answer:
          "Under SMS Notifications, you can set up automatic re-engagement messages — for example, automatically send an SMS to any client who hasn't booked in 45 days. This runs in the background with no manual effort.",
      },
      {
        question: "How do I manage the SMS inbox?",
        answer:
          "Go to Clients → SMS Inbox. All two-way SMS conversations with clients appear here. You can reply directly to clients, and all messages are saved to their profile. You'll see unread message counts in the sidebar badge.",
      },
      {
        question: "How do I get more Google Reviews?",
        answer:
          "Go to Clients → Google Reviews. Connect your Google Business profile, then enable automatic review requests. After each completed appointment, clients automatically receive an SMS or email prompting them to leave a Google review.",
      },
    ],
  },
  {
    id: "reports",
    icon: BarChart3,
    title: "Reports & Analytics",
    color: "text-indigo-600",
    description: "Understand your business performance with detailed reporting.",
    articles: [
      {
        question: "What reports are available?",
        answer:
          "Finance → Reports includes: Sales Summary, Revenue by Service, Revenue by Staff, Product Sales, Appointment Summary, Cancellation Report, No-Show Report, and Tax Report. The Dashboard shows a real-time overview of today's activity. Analytics shows trends over time.",
      },
      {
        question: "How do I view revenue by staff member?",
        answer:
          "Go to Finance → Reports and select the Revenue by Staff report. Choose your date range. You'll see each team member's total service revenue, product sales, tip amount, and number of appointments.",
      },
      {
        question: "How do commissions work?",
        answer:
          "Go to Finance → Commissions. Set commission rates per staff member — either a flat percentage of service revenue or tiered rates based on performance. The commission report calculates each staff member's earned commission for any date range.",
      },
      {
        question: "What is Revenue Intelligence?",
        answer:
          "Revenue Intelligence (Overview → Revenue Intelligence) uses AI to analyze your booking patterns, client retention, and revenue trends. It surfaces insights like your busiest times, highest-value clients, and services with the most cancellations — helping you make smarter business decisions.",
      },
      {
        question: "How do I export reports?",
        answer:
          "On any report page, click the Export button to download a CSV or PDF. You can also print reports directly from the browser.",
      },
    ],
  },
  {
    id: "notifications",
    icon: Bell,
    title: "Notifications & Reminders",
    color: "text-orange-600",
    description: "Keep clients informed with automated SMS and email messages.",
    articles: [
      {
        question: "How do I set up SMS notifications?",
        answer:
          "Go to Settings → SMS Notifications. Enable the notifications you want — booking confirmations, reminders, cancellation notices, and review requests. Set the timing for reminders (e.g. 24 hours before). Messages are sent automatically using your Twilio number.",
      },
      {
        question: "How do I set up email notifications?",
        answer:
          "Go to Settings → Email Notifications. Toggle on the emails you want to send — booking confirmations, reminders, follow-ups. Customize the email template with your business name and branding.",
      },
      {
        question: "Can I customize the text of notification messages?",
        answer:
          "Yes. In SMS/Email Notification settings, click Edit on any message template. You can customize the text and use merge tags like {client_name}, {appointment_date}, {service_name}, and {business_name} to personalize each message.",
      },
      {
        question: "Why are my SMS notifications not sending?",
        answer:
          "Check that your Twilio credentials are saved in Business Settings → Integrations. Also verify the client has a valid mobile number in their profile. If you're in trial mode, Twilio may only send to verified numbers. Contact support if messages are still not going through.",
      },
    ],
  },
  {
    id: "website-builder",
    icon: Globe,
    title: "Website Builder",
    color: "text-teal-600",
    description: "Build a professional website for your business — no code needed.",
    articles: [
      {
        question: "How do I access the Website Builder?",
        answer:
          "Click Website Builder in the sidebar under Tools. It opens in a new tab. You can also go directly to your Certxa domain at /website-builder/.",
      },
      {
        question: "How do I create my first website?",
        answer:
          "In the Website Builder, click New Site. Choose a template that fits your business style — salon, spa, barbershop, and more. Give your site a name and click Create. The editor opens with your template ready to customize.",
      },
      {
        question: "How do I edit text on my website?",
        answer:
          "Click any text block on the canvas to select it. A text editor toolbar appears — change the font, size, color, alignment, and content. Click outside to deselect. Changes are saved automatically.",
      },
      {
        question: "How do I add or change images?",
        answer:
          "Click any image on the canvas to select it. Click Replace Image in the toolbar to upload a new photo from your device or choose from the built-in stock photo library. Drag the corners to resize.",
      },
      {
        question: "How do I add a booking button to my website?",
        answer:
          "Select any button element or add a new Button block. In the link settings, choose Booking Page and your online booking URL will be linked automatically. Visitors who click it go directly to your booking page.",
      },
      {
        question: "How do I add a new page to my website?",
        answer:
          "In the Website Builder sidebar, click Pages → Add Page. Give the page a name (e.g. 'About Us', 'Gallery', 'Pricing'). It will appear in your site's navigation automatically. Edit it the same way as any other page.",
      },
      {
        question: "How do I publish my website?",
        answer:
          "Click the Publish button in the top-right corner of the editor. Your site goes live instantly at your Certxa subdomain. To use a custom domain, go to Site Settings → Domain and enter your domain name, then follow the DNS instructions.",
      },
      {
        question: "Can I connect a custom domain to my website?",
        answer:
          "Yes. Go to Site Settings → Domain in the Website Builder. Enter your custom domain (e.g. www.yoursalon.com). You'll be shown two DNS records to add at your domain registrar (GoDaddy, Namecheap, etc.). Once DNS propagates (usually 24–48 hours), your site will be live on your custom domain.",
      },
      {
        question: "How do I add a contact form to my website?",
        answer:
          "In the block library (click the + Add Block button), find the Contact Form block. Drag it onto your page. Configure which fields to include (name, email, phone, message) and where form submissions should be sent. Submissions are emailed to your business email and logged in the Website Builder.",
      },
      {
        question: "How do I optimize my site for Google (SEO)?",
        answer:
          "In Site Settings → SEO, set your page title, meta description, and keywords for each page. Add alt text to all images. The Website Builder also auto-generates a sitemap.xml for Google to crawl. For local SEO, make sure your business name, address, and phone number are consistent across your site and Google Business profile.",
      },
      {
        question: "What templates are available?",
        answer:
          "Templates include layouts designed for salons, spas, barbershops, nail studios, tattoo studios, massage therapists, and general service businesses. Each template includes a home page, services page, gallery, and contact page — all fully customizable.",
      },
    ],
  },
  {
    id: "intelligence",
    icon: Brain,
    title: "Business Intelligence Center",
    color: "text-violet-600",
    description: "Understand what your salon's AI insights mean and what to do with them.",
    articles: [
      {
        question: "What is the Business Intelligence Center?",
        answer:
          "The Business Intelligence Center is your salon's behind-the-scenes advisor. It automatically analyzes your appointment history, client behavior, booking patterns, and revenue every day — then translates everything into plain-English insights. Instead of looking at raw numbers, you see clear answers: which clients might stop coming back, how much revenue you're missing, and exactly what Certxa is already doing to help. No spreadsheets, no guesswork.",
      },
      {
        question: "What is the Business Health Score?",
        answer:
          "The Business Health Score is a single number from 0–100 that tells you at a glance how your salon is performing. It's calculated from five areas: how well you're keeping existing clients (retention), how often clients rebook after each visit (rebooking rate), how busy your schedule is (booking utilization), how your revenue is trending, and how many new clients you're bringing in. A score of 85+ is excellent. 70–84 is good with room to improve. Below 70 means there are specific areas that need attention — and the dashboard will tell you exactly what they are.",
      },
      {
        question: `What does "Money You're Missing Out On" mean?`,
        answer:
          "This is revenue your salon could have earned but didn't — from appointments that were cancelled and never refilled, no-show clients who didn't pay, and empty time slots that sat unused. For example, if 3 clients cancelled last week and those slots stayed empty, the service prices they would have paid shows up here. It's not money you lost from your pocket — it's potential revenue that slipped away. Seeing this number helps you decide whether to run a promotion, reach out to clients on the waitlist, or fill gaps with walk-ins.",
      },
      {
        question: `What does "Money We Can Still Recover" mean?`,
        answer:
          "Based on your upcoming open slots and client behavior, Certxa estimates how much of that missed revenue can still be recovered. For example, if you have 8 open slots this week and your average service is $65, there's $520 in potential revenue still up for grabs. Certxa uses this estimate to prioritize which clients to contact and which time slots to promote. It's not a guarantee — it's a realistic target that helps focus the system's outreach efforts.",
      },
      {
        question: `What are "Clients Who May Not Return"?`,
        answer:
          `These are clients who are overdue for their next visit based on how often they normally come in. For example, if a client usually books every 5 weeks but it's been 9 weeks since their last visit, they appear here as at-risk. The longer the gap, the higher the risk they've gone to a competitor. Certxa automatically sends a friendly re-engagement message to these clients — a simple "We miss you, would you like to book?" — to bring them back before they're gone for good. You can see who received a message and whether they responded under the Clients Who May Not Return tab.`,
      },
      {
        question: `What is "Empty Appointment Time"?`,
        answer:
          "Empty appointment time refers to slots in your schedule that went unused and generated zero revenue. Every empty 60-minute slot is a missed service. The intelligence center identifies which days and hours consistently have the most empty time — for example, Tuesday mornings or Friday afternoons — so you can decide whether to promote those times, run a limited-time discount, or adjust your hours. Understanding your empty time patterns is the first step to filling them.",
      },
      {
        question: `What does "Certxa Is Working For You" show?`,
        answer:
          "This section shows you everything Certxa is doing automatically on your behalf, in real time. Examples of what you'll see: Contacted 8 clients who cancelled appointments, Sent rebooking reminders to 12 overdue clients, Identified 10 clients at risk of not returning, Helped recover an estimated $485 this month. You don't need to do anything to trigger these — they happen automatically as long as Autonomous Mode is turned on. This section is updated daily so you always know what actions the system has taken.",
      },
      {
        question: `What are "Appointment Reminder Campaigns"?`,
        answer:
          `Appointment Reminder Campaigns are automatic text messages sent to clients who are overdue for their next visit. When a client hasn't booked in a while, Certxa sends them a personalized SMS — something like "Hi [Name], it's been a while! Ready to book your next appointment? Tap here." These are sent at appropriate times (not late at night) and respect clients who have opted out of marketing messages. You can see the full list of messages sent, who responded, and how many converted to bookings on the Campaigns tab.`,
      },
      {
        question: "What is No-Show Risk and how does it work?",
        answer:
          "No-Show Risk identifies clients with upcoming appointments who have a history of not showing up or cancelling last-minute. Certxa gives each upcoming appointment a risk score based on the client's past behavior. High-risk appointments get an automatic extra reminder sent 2–3 hours before the appointment time — a gentle nudge that dramatically reduces no-shows. You can also see the list of upcoming high-risk appointments and send a manual reminder with one click.",
      },
      {
        question: "How does the Revenue Forecast work?",
        answer:
          "The Revenue Forecast predicts your expected earnings over the next 30–90 days based on current bookings, historical patterns, seasonal trends, and how full your schedule is. It separates confirmed revenue (appointments already booked) from projected revenue (expected based on typical booking pace). If your forecast is lower than usual, it's a signal to run a promotion or reach out to clients earlier than normal. The forecast is recalculated every time you view it so it always reflects your latest bookings.",
      },
      {
        question: "What is Staff Performance Intelligence?",
        answer:
          "Staff Performance Intelligence shows how each team member is performing — not just in revenue, but in client retention. You'll see metrics like: how many clients each staff member has served, how many of those clients rebooking with them again, their average ticket value, and their no-show/cancellation rate. This is useful for identifying your top performers, coaching staff who have high cancellation rates, and understanding which services or staff members are the most popular with clients.",
      },
      {
        question: "What is the Weekly Business Digest email?",
        answer:
          "Every Monday at 9am, Certxa emails you a summary of the previous week's performance. It includes your revenue, number of appointments, new clients, top services, and any important alerts — like if your rebooking rate dropped or you had an unusual number of no-shows. It's a quick read that keeps you informed without having to log into the dashboard. You can send yourself a preview at any time from the Intelligence Center header, and you can turn it off in your account settings if you prefer.",
      },
      {
        question: "What is Autonomous Mode and should I turn it on?",
        answer:
          "Autonomous Mode is a setting that lets Certxa automatically send SMS messages to clients on your behalf — re-engagement messages for overdue clients, win-back messages for at-risk clients, and rebooking reminders. When it's on (which is the default), the system works silently in the background. When it's off, insights are still calculated but no messages are sent automatically — you can still send them manually. Most salon owners leave it on. If you want full control over every message, turn it off and send campaigns manually from the Campaigns tab.",
      },
      {
        question: "How does the Booking Pattern Heatmap work?",
        answer:
          "The Booking Pattern Heatmap is a visual grid showing which days and hours are busiest for your salon. Darker purple means more bookings happen at that time. Lighter means fewer. Use this to understand your peak hours, plan staff schedules, and identify quiet times worth promoting. For example, if Wednesday at 2pm is always light, you could offer a midweek discount to drive traffic during that window.",
      },
      {
        question: "How often does the Intelligence Center update?",
        answer:
          "The Intelligence Center runs automatically every 6 hours in the background. For most businesses, the data you see reflects activity from the past few hours. If you want to force a fresh calculation immediately — for example, after a busy weekend — click the Refresh button in the top-right corner of the Intelligence page. A full refresh takes about 30–60 seconds.",
      },
    ],
  },
  {
    id: "ai-receptionist",
    icon: Phone,
    title: "AI Receptionist",
    color: "text-rose-600",
    description: "Let AI handle your salon's phone calls — bookings, questions, and more.",
    articles: [
      {
        question: "What is the AI Receptionist?",
        answer: (
          <div className="space-y-3">
            <p>
              The AI Receptionist is an add-on feature that answers your salon's phone calls automatically using artificial intelligence. When a client calls your salon number, the AI picks up, greets them warmly, and handles the conversation — whether they're asking about prices, trying to book an appointment, or want to reschedule.
            </p>
            <p>
              It sounds natural and professional, responds instantly (no hold times), and is available 24 hours a day, 7 days a week — even when you're with a client or the salon is closed.
            </p>
            <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-lg p-3">
              <p className="font-semibold text-rose-700 dark:text-rose-400 text-xs uppercase tracking-wide mb-1">Add-On Feature</p>
              <p>The AI Receptionist is not included in base plans. It's available as a paid add-on for <strong>Professional</strong> and <strong>Elite</strong> subscribers. Contact support or visit your Billing page to add it to your plan.</p>
            </div>
          </div>
        ),
      },
      {
        question: "Which plans include the AI Receptionist?",
        answer: (
          <div className="space-y-3">
            <p>The AI Receptionist is available as an optional add-on for the following subscription plans:</p>
            <ul className="space-y-2">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 w-2 h-2 rounded-full bg-violet-500 flex-shrink-0 mt-1.5" />
                <div><strong>Professional Plan</strong> — AI Receptionist available as an add-on</div>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 w-2 h-2 rounded-full bg-amber-500 flex-shrink-0 mt-1.5" />
                <div><strong>Elite Plan</strong> — AI Receptionist available as an add-on</div>
              </li>
            </ul>
            <p className="text-sm">It is not available on the Starter plan. To add it, go to <strong>Account → Billing → Add-Ons</strong> or contact our support team at support@certxa.com.</p>
          </div>
        ),
      },
      {
        question: "What can the AI Receptionist handle on a call?",
        answer: (
          <div className="space-y-2">
            <p>The AI Receptionist is trained specifically for salon businesses and can handle a wide range of calls:</p>
            <ul className="space-y-1.5 mt-2">
              {[
                ["Booking appointments", "Clients can book any service with any available staff member, on any day/time you're open."],
                ["Cancelling appointments", "Clients can cancel an existing appointment by providing their name or phone number."],
                ["Rescheduling appointments", "Clients can move an existing appointment to a different date or time."],
                ["Pricing questions", "The AI knows all your services and prices and can answer 'How much is a haircut?' instantly."],
                ["Business hours", "Clients can ask what time you open, close, or whether you're open on holidays."],
                ["Location & directions", "The AI can provide your salon's address and guide callers on how to find you."],
                ["General questions", "Things like 'Do you take walk-ins?' or 'Do you offer gift cards?' — the AI handles these based on your business profile."],
              ].map(([title, desc]) => (
                <li key={title} className="flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-rose-400 flex-shrink-0" />
                  <div><strong>{title}</strong> — {desc}</div>
                </li>
              ))}
            </ul>
          </div>
        ),
      },
      {
        question: "How do I set up the AI Receptionist?",
        answer:
          "Go to Settings → AI Receptionist in your sidebar. From there you'll configure: your salon's greeting message, the phone number to forward calls from (your existing salon number via Twilio), your business hours for the AI to reference, and a brief description of your salon. Once configured, click Enable and the AI will begin answering calls. Setup takes about 10 minutes. If you need help, contact support@certxa.com and we'll walk you through it.",
      },
      {
        question: "How does the AI book appointments during a call?",
        answer:
          "When a caller says they'd like to book an appointment, the AI asks them which service they're interested in, their preferred date and time, and which staff member they prefer (if any). It then checks your live availability in real time and offers the closest available slots. Once the caller confirms, the appointment is created directly in your Certxa calendar — exactly as if a staff member had booked it. The client also receives the same SMS/email confirmation they would get from any other booking.",
      },
      {
        question: "Can the AI look up and cancel an existing appointment?",
        answer:
          "Yes. When a caller says they need to cancel, the AI asks for their name and phone number to find their upcoming appointment. Once found, it confirms the details and cancels it upon the caller's request. The cancellation is reflected immediately in your calendar, and the client receives a confirmation of the cancellation just like any other cancellation.",
      },
      {
        question: "Can the AI reschedule an appointment?",
        answer:
          "Yes. The caller provides their name or phone number, the AI finds their existing appointment, and then guides them through picking a new date and time. It checks availability in real time and moves the appointment once confirmed. The client receives a reschedule confirmation via SMS or email.",
      },
      {
        question: "What happens if the AI doesn't know how to answer a question?",
        answer:
          "If a caller asks something outside the AI's knowledge — for example, a very specific question about a custom service or a personal request — the AI will politely let them know it can't answer that question and offer to take a message or let them know the best way to reach a human. You can also configure a fallback: if the AI can't handle the call, it transfers to a staff member's phone or sends you an SMS alert with the caller's number so you can call them back.",
      },
      {
        question: "Is the AI Receptionist available 24/7?",
        answer:
          "Yes. The AI answers calls any time of day or night, 365 days a year. This is one of its biggest benefits — clients can book at midnight, on weekends, or on holidays when your salon is closed. You can configure whether the AI should offer bookings during after-hours calls or simply provide information and take a message.",
      },
      {
        question: "Can I listen to recordings of calls?",
        answer:
          "Yes. Every call handled by the AI Receptionist is logged under Settings → AI Receptionist → Call History. You can see the date, time, caller number, what the AI did (booked, cancelled, answered question, etc.), and play back a recording of the call. Call logs are kept for 90 days. This is useful for quality review, handling any misunderstandings, or following up with callers who didn't complete a booking.",
      },
      {
        question: "How do I customize what the AI says?",
        answer:
          "In Settings → AI Receptionist, you can customize: the greeting (e.g. 'Thank you for calling Luxe Hair Studio!'), the AI's name if you want it to introduce itself, specific answers for common questions your salon gets, and after-hours messaging. The AI automatically knows your services, prices, hours, and location from your Certxa business profile — so those stay in sync automatically whenever you update them.",
      },
      {
        question: "Will clients know they're talking to an AI?",
        answer:
          "The AI Receptionist is designed to sound natural and helpful. By default it does not proactively announce itself as an AI unless asked directly — in which case it will honestly confirm it is an automated system. Many salon owners find clients appreciate the instant answer and easy booking experience. You can include a disclosure in your greeting if you prefer, such as 'You've reached an automated booking assistant for [Salon Name].'",
      },
      {
        question: "Does the AI Receptionist work with my existing phone number?",
        answer:
          "Yes. The AI Receptionist is powered by Twilio and connects to a dedicated phone number. You can either use a new number provided by Certxa or forward your existing salon number to the AI line. Call forwarding is set up at your phone carrier level — your carrier's support team can help with this in under 5 minutes. Once forwarding is active, all incoming calls are routed to the AI.",
      },
    ],
  },
  {
    id: "settings",
    icon: Settings,
    title: "Account & Settings",
    color: "text-slate-600",
    description: "Manage your account, business profile, and integrations.",
    articles: [
      {
        question: "How do I update my business information?",
        answer:
          "Go to Settings → Business Settings. Update your business name, address, phone number, email, and social media links. This information appears on your booking page and website.",
      },
      {
        question: "How do I change my password?",
        answer:
          "Go to Settings → My Account → Security. Enter your current password, then your new password twice, and save. If you've forgotten your password, log out and click Forgot Password on the login screen.",
      },
      {
        question: "How do I manage multiple locations?",
        answer:
          "Multi-location is available on the Elite plan. Go to Settings → Multi-Location to add additional business locations. Each location has its own calendar, staff, and settings. Switch between locations using the location selector at the top of the dashboard.",
      },
      {
        question: "How do I connect Stripe for payments?",
        answer:
          "Go to Settings → Business Settings → Payments and click Connect Stripe. You'll be redirected to Stripe to create or connect an account. Once connected, you can accept card payments online and in-person.",
      },
      {
        question: "How do I connect Google Calendar?",
        answer:
          "Go to Settings → Calendar Settings → Integrations and click Connect Google Calendar. Authorize access. Your Certxa appointments will sync to your Google Calendar automatically, and you can block Certxa time based on your Google Calendar events.",
      },
      {
        question: "What are API Keys used for?",
        answer:
          "API Keys (Elite plan) let you connect Certxa to external tools like Zapier, your own apps, or custom integrations. Go to Settings → API Keys to generate a key. Our API documentation is available under the API Keys page.",
      },
      {
        question: "How do I cancel or change my plan?",
        answer:
          "Go to the Account section → Billing. You'll see your current plan and billing cycle. Click Change Plan to upgrade, downgrade, or cancel. If you cancel, your account remains active until the end of the billing period.",
      },
    ],
  },
];

function ArticleAccordion({ articles }: { articles: Article[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  return (
    <div className="divide-y divide-border">
      {articles.map((article, i) => (
        <div key={i}>
          <button
            className="w-full flex items-start justify-between gap-3 py-4 text-left hover:text-primary transition-colors"
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
          >
            <span className="font-medium text-sm leading-snug">{article.question}</span>
            {openIndex === i
              ? <ChevronDown className="h-4 w-4 flex-shrink-0 mt-0.5 text-primary" />
              : <ChevronRight className="h-4 w-4 flex-shrink-0 mt-0.5 text-muted-foreground" />}
          </button>
          {openIndex === i && (
            <div className="pb-4 text-sm text-muted-foreground leading-relaxed">
              {article.answer}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function HelpCenter() {
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const { pick } = useLanguage();

  const t = {
    heading:       pick({ en: "Help Center",                       vi: "Trung tâm hỗ trợ",            es: "Centro de ayuda",                fr: "Centre d'aide" }),
    articlesAcross: pick({ en: "articles across",                  vi: "bài viết trong",               es: "artículos en",                   fr: "articles dans" }),
    topics:        pick({ en: "topics.",                           vi: "chủ đề.",                      es: "temas.",                         fr: "sujets." }),
    searchPlaceholder: pick({ en: "Search help articles…",        vi: "Tìm kiếm bài viết trợ giúp…", es: "Buscar artículos de ayuda…",      fr: "Rechercher des articles…" }),
    articles:      pick({ en: "articles",                          vi: "bài viết",                     es: "artículos",                      fr: "articles" }),
    allTopics:     pick({ en: "All Topics",                        vi: "Tất cả chủ đề",                es: "Todos los temas",                fr: "Tous les sujets" }),
    noMatch:       pick({ en: "No articles match",                 vi: "Không có bài viết nào khớp",   es: "Sin artículos para",             fr: "Aucun article pour" }),
    tryKeywords:   pick({ en: "Try different keywords or browse topics above.", vi: "Thử từ khóa khác hoặc duyệt chủ đề.", es: "Prueba palabras clave diferentes o navega los temas.", fr: "Essayez d'autres mots-clés ou parcourez les sujets." }),
    stillNeedHelp: pick({ en: "Still need help?",                  vi: "Vẫn cần hỗ trợ?",              es: "¿Sigues necesitando ayuda?",      fr: "Besoin d'aide supplémentaire ?" }),
    cantFind:      pick({ en: "Can't find what you're looking for? Our support team is here for you.", vi: "Không tìm thấy điều bạn cần? Đội hỗ trợ chúng tôi ở đây.", es: "¿No encuentras lo que buscas? Nuestro equipo de soporte está aquí para ti.", fr: "Vous ne trouvez pas ce que vous cherchez ? Notre équipe est là pour vous." }),
    emailSupport:  pick({ en: "Email Support",                     vi: "Gửi email hỗ trợ",             es: "Soporte por correo",             fr: "Support par e-mail" }),
    visitWebsite:  pick({ en: "Visit certxa.com",                  vi: "Truy cập certxa.com",          es: "Visitar certxa.com",              fr: "Visiter certxa.com" }),
  };

  const sectionMeta: Record<string, { title: string; description: string }> = {
    "getting-started": {
      title:       pick({ en: "Getting Started",                vi: "Bắt đầu",                       es: "Primeros pasos",                    fr: "Démarrer" }),
      description: pick({ en: "Everything you need to get up and running with Certxa.", vi: "Mọi thứ bạn cần để bắt đầu với Certxa.", es: "Todo lo que necesitas para comenzar con Certxa.", fr: "Tout ce qu'il faut pour démarrer avec Certxa." }),
    },
    "calendar": {
      title:       pick({ en: "Calendar & Scheduling",         vi: "Lịch & Lên lịch",               es: "Calendario y programación",         fr: "Calendrier et planification" }),
      description: pick({ en: "Manage your appointments, blocks, and team schedule.", vi: "Quản lý lịch hẹn, chặn thời gian và lịch nhóm.", es: "Gestiona tus citas, bloqueos y horario del equipo.", fr: "Gérez vos rendez-vous, blocages et planning d'équipe." }),
    },
    "clients": {
      title:       pick({ en: "Clients & CRM",                 vi: "Khách hàng & CRM",              es: "Clientes y CRM",                    fr: "Clients et CRM" }),
      description: pick({ en: "Manage your client database, history, and relationships.", vi: "Quản lý cơ sở dữ liệu, lịch sử và quan hệ khách hàng.", es: "Gestiona tu base de clientes, historial y relaciones.", fr: "Gérez votre base clients, historique et relations." }),
    },
    "services": {
      title:       pick({ en: "Services & Pricing",            vi: "Dịch vụ & Giá cả",              es: "Servicios y precios",               fr: "Services et tarifs" }),
      description: pick({ en: "Set up the services you offer, pricing, and duration.", vi: "Thiết lập dịch vụ, giá và thời gian.", es: "Configura los servicios, precios y duración.", fr: "Configurez vos services, tarifs et durées." }),
    },
    "online-booking": {
      title:       pick({ en: "Online Booking",                vi: "Đặt lịch trực tuyến",           es: "Reserva en línea",                  fr: "Réservation en ligne" }),
      description: pick({ en: "Let clients book themselves 24/7 through your booking page.", vi: "Để khách tự đặt lịch 24/7 qua trang đặt lịch.", es: "Permite que los clientes reserven 24/7 por tu página.", fr: "Permettez aux clients de réserver 24h/24 via votre page." }),
    },
    "pos": {
      title:       pick({ en: "Point of Sale & Payments",      vi: "Điểm bán hàng & Thanh toán",    es: "Punto de venta y pagos",            fr: "Point de vente et paiements" }),
      description: pick({ en: "Check out clients, process payments, and sell products.", vi: "Thanh toán khách, xử lý thanh toán và bán sản phẩm.", es: "Cobra a clientes, procesa pagos y vende productos.", fr: "Encaissez, traitez les paiements et vendez des produits." }),
    },
    "loyalty": {
      title:       pick({ en: "Loyalty Program",               vi: "Chương trình khách hàng thân thiết", es: "Programa de fidelización",       fr: "Programme de fidélité" }),
      description: pick({ en: "Reward your best clients and keep them coming back.", vi: "Thưởng khách hàng tốt nhất và giữ chân họ.", es: "Recompensa a tus mejores clientes y fidelízalos.", fr: "Récompensez vos meilleurs clients et fidélisez-les." }),
    },
    "marketing": {
      title:       pick({ en: "Campaigns & Marketing",         vi: "Chiến dịch & Tiếp thị",         es: "Campañas y marketing",              fr: "Campagnes et marketing" }),
      description: pick({ en: "Reach your clients with targeted SMS and email campaigns.", vi: "Tiếp cận khách hàng với chiến dịch SMS và email mục tiêu.", es: "Llega a tus clientes con campañas SMS y email dirigidas.", fr: "Atteignez vos clients avec des campagnes SMS et email ciblées." }),
    },
    "reports": {
      title:       pick({ en: "Reports & Analytics",           vi: "Báo cáo & Phân tích",           es: "Informes y análisis",               fr: "Rapports et analyses" }),
      description: pick({ en: "Understand your business performance with detailed reporting.", vi: "Hiểu hiệu suất kinh doanh với báo cáo chi tiết.", es: "Comprende el rendimiento de tu negocio con informes detallados.", fr: "Comprenez les performances de votre activité avec des rapports détaillés." }),
    },
    "notifications": {
      title:       pick({ en: "Notifications & Reminders",     vi: "Thông báo & Nhắc nhở",          es: "Notificaciones y recordatorios",    fr: "Notifications et rappels" }),
      description: pick({ en: "Keep clients informed with automated SMS and email messages.", vi: "Giữ khách hàng được thông báo với tin nhắn SMS và email tự động.", es: "Mantén informados a los clientes con mensajes automáticos.", fr: "Tenez vos clients informés avec des messages automatiques." }),
    },
    "website-builder": {
      title:       pick({ en: "Website Builder",               vi: "Tạo website",                   es: "Creador de sitio web",              fr: "Créateur de site web" }),
      description: pick({ en: "Build a professional website for your business — no code needed.", vi: "Xây dựng website chuyên nghiệp — không cần lập trình.", es: "Crea un sitio profesional para tu negocio — sin código.", fr: "Créez un site professionnel pour votre activité — sans code." }),
    },
    "intelligence": {
      title:       pick({ en: "Business Intelligence Center",  vi: "Trung tâm thông minh kinh doanh", es: "Centro de inteligencia empresarial", fr: "Centre d'intelligence métier" }),
      description: pick({ en: "Understand what your salon's AI insights mean and what to do with them.", vi: "Hiểu những gì phân tích AI của salon có nghĩa và cách làm gì với chúng.", es: "Entiende qué significan los insights de IA de tu salón y qué hacer con ellos.", fr: "Comprenez ce que signifient les insights IA de votre salon et comment les utiliser." }),
    },
    "ai-receptionist": {
      title:       pick({ en: "AI Receptionist (Autumn)",      vi: "Lễ tân AI (Autumn)",            es: "Recepcionista IA (Autumn)",          fr: "Réceptionniste IA (Autumn)" }),
      description: pick({ en: "Set up and manage your AI phone receptionist.", vi: "Thiết lập và quản lý lễ tân điện thoại AI của bạn.", es: "Configura y gestiona tu recepcionista telefónica IA.", fr: "Configurez et gérez votre réceptionniste téléphonique IA." }),
    },
    "settings": {
      title:       pick({ en: "Account & Settings",            vi: "Tài khoản & Cài đặt",           es: "Cuenta y ajustes",                  fr: "Compte et paramètres" }),
      description: pick({ en: "Manage your account, business profile, and integrations.", vi: "Quản lý tài khoản, hồ sơ doanh nghiệp và tích hợp.", es: "Gestiona tu cuenta, perfil de negocio e integraciones.", fr: "Gérez votre compte, profil d'entreprise et intégrations." }),
    },
  };

  const filtered = search.trim().toLowerCase();

  const matchingSections = sections
    .map((s) => ({
      ...s,
      articles: s.articles.filter(
        (a) =>
          !filtered ||
          a.question.toLowerCase().includes(filtered) ||
          (typeof a.answer === "string" && a.answer.toLowerCase().includes(filtered))
      ),
    }))
    .filter((s) => !filtered || s.articles.length > 0);

  const totalArticles = sections.reduce((n, s) => n + s.articles.length, 0);

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Hero */}
      <div className="bg-gradient-to-br from-[#3B0764] to-[#6D28D9] text-white">
        <div className="max-w-4xl mx-auto px-6 py-14 text-center">
          <div className="flex justify-center mb-4">
            <BookOpen className="h-10 w-10 opacity-80" />
          </div>
          <h1
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontWeight: 700,
              fontSize: "2.4rem",
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
            }}
          >
            {t.heading}
          </h1>
          <p className="mt-2 text-purple-200 text-base">
            {totalArticles} {t.articlesAcross} {sections.length} {t.topics}
          </p>
          <div className="mt-6 max-w-xl mx-auto relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-300 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-purple-300 focus-visible:ring-white/30 h-11"
            />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Quick links grid (only when not searching) */}
        {!filtered && !activeSection && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-10">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-4 text-left hover:border-primary/30 hover:shadow-md transition-all"
              >
                <s.icon className={cn("h-5 w-5", s.color)} />
                <span className="font-semibold text-sm leading-tight">{sectionMeta[s.id]?.title ?? s.title}</span>
                <span className="text-xs text-muted-foreground">{s.articles.length} {t.articles}</span>
              </button>
            ))}
          </div>
        )}

        {/* Back button when a section is selected */}
        {activeSection && !filtered && (
          <button
            onClick={() => setActiveSection(null)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
          >
            <ChevronRight className="h-4 w-4 rotate-180" />
            {t.allTopics}
          </button>
        )}

        {/* Content */}
        <div className="space-y-6">
          {matchingSections
            .filter((s) => !activeSection || s.id === activeSection)
            .map((section) => (
              <div
                key={section.id}
                className="rounded-2xl border border-border bg-card overflow-hidden"
              >
                <button
                  className="w-full flex items-center gap-3 px-6 py-5 text-left hover:bg-muted/30 transition-colors"
                  onClick={() =>
                    setActiveSection(activeSection === section.id ? null : section.id)
                  }
                >
                  <div className={cn("p-2 rounded-lg bg-muted", section.color)}>
                    <section.icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{sectionMeta[section.id]?.title ?? section.title}</p>
                    <p className="text-xs text-muted-foreground">{sectionMeta[section.id]?.description ?? section.description}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {section.articles.length}
                  </Badge>
                  {activeSection === section.id
                    ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>

                {(activeSection === section.id || !!filtered) && (
                  <div className="px-6 pb-2">
                    <ArticleAccordion articles={section.articles} />
                  </div>
                )}
              </div>
            ))}

          {filtered && matchingSections.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <HelpCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">{t.noMatch} "{search}"</p>
              <p className="text-sm mt-1">{t.tryKeywords}</p>
            </div>
          )}
        </div>

        {/* Contact footer */}
        <div className="mt-12 rounded-2xl border border-border bg-card p-8 text-center">
          <HelpCircle className="h-8 w-8 mx-auto mb-3 text-primary/60" />
          <h2 className="font-semibold text-lg mb-1">{t.stillNeedHelp}</h2>
          <p className="text-muted-foreground text-sm mb-5">
            {t.cantFind}
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <a
              href="mailto:support@certxa.com"
              className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Mail className="h-4 w-4" />
              {t.emailSupport}
            </a>
            <a
              href="https://certxa.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              {t.visitWebsite}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
