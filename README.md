# iCalendar for Homey
This Homey app allows you to add your calendars to Homey using the ical format. After adding your calendar(s) you will be able to start flows based on upcoming calendar events or have Homey tell you your appointments. You can add multiple calendars and for each trigger or action select which appointments should be returned. The app is inspired by the original iCalendar to Voice app but has been completely rewritten and serves as an alternative outside the app store that fixes an issue with recurring events.

## Instructions
After installation go to the app settings and select the iCalender app settings page. Here you can add your calendars by supplying a recognizable name and iCal link. If you don't know how to get the iCal link from your calendar, just Google for it. Below are the steps to retrieve the iCal link from a Google Calendar.
* Go to [Google Calendar](https://calendar.google.com);
* Click on the cogwheel and select the settings option;
* Click on the calendar you wish to add to Homey on the left hand side of the page;
* Scroll down to 'Secret address in iCal format'. You can copy and paste this link into the iCal field with the Homey iCalendar settings page.

## Supported Flow Cards
* [TRIGGER] Next appointment in ... (trigger flows based on upcoming events)
* [ACTION] Next appointment from selected calendar(s)
* [ACTION] Today's (upcoming) appointment from selected calendar(s)
* [ACTION] Tomorrow's (first) appointment from selected calendar(s)
* [ACTION] Appointments from selected day of the week from selected calendar(s)

## Supported Voice Commands
* What is my next appointment today?
* What is my first appointment tomorrow?
* What are all my appointments for today/tomorrow/sunday/monday/tuesday/wednesday/thursday/friday/saturday/?

## Changelog
### v1.0.3 - 2019-11-23
* FIX: fix for events with undefined location
