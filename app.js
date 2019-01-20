"use strict";

const Homey = require('homey');
const ical = require('node-ical');
const moment = require('moment');
const { promisify } = require('util');
var events = [];

class CalendarApp extends Homey.App {

  onInit() {
    this.log('Initializing iCalendar for Homey App ...');

    // MOMENT
    if (Homey.__("moment_locale") == 'nl') {
      moment.updateLocale('nl', {
        months : [ "januari", "februari", "maart", "april", "mei", "juni", "july", "augustus", "september", "oktober", "november", "december" ]
      });
    } else {
      moment.updateLocale('en', {
        months : [ "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December" ]
      });
    }

    // START EVENT UPDATES
    setTimeout(this.updateEvents.bind(this), 2000);
    var interval = Homey.ManagerSettings.get("calendar_refresh_interval") || 5;
    this.updateEventsInterval = setInterval(this.updateEvents.bind(this), interval * 60 * 1000);

    // START TRIGGER CHECKS EVERY MINUTE
    setTimeout(this.checkEvents.bind(this), 10000);
    this.checkEventsInterval = setInterval(this.checkEvents.bind(this), 60 * 1000);

    // SPEECH
    Homey.ManagerSpeechInput.on('speechEval', function( speech, callback ) {
      const match = speech.matches.importantProperty.length > 3;
      callback( null, match );
      // todo: implement speech triggers
    });

    Homey.ManagerSpeechInput.on('speechMatch', function( speech, onSpeechEvalData ) {
      // onSpeechData is whatever you returned in the onSpeech callback
      // process and execute the user phrase here
      // todo: implement speech triggers
    });

    // FLOW CARDS TRIGGERS
    new Homey.FlowCardTrigger('trigger_next_appointment_in')
      .register()
      .registerRunListener((args, state) => {
        // todo: evaluate something
        return Promise.resolve(true);
      })

    // FLOW CARDS ACTIONS
    new Homey.FlowCardAction('action_next_appointment')
      .register()
      .registerRunListener((args, state) => {
        var next_event = events[0];
        var second_event = events[1];
        console.log(next_event);
        console.log(second_event);
        return Promise.resolve(true);
      })

  }

  async updateEvents() {
    const calendars = Homey.ManagerSettings.get("calendars") || [];
    const icalFromURL = promisify(ical.fromURL);

    for (const calendar of calendars) {
      const data = await icalFromURL(calendar.url, function(err, data) {
        if (err) this.log(err);

        events.length = 0;

        for (let k in data) {
      		if (data.hasOwnProperty(k)) {

            var rangeStart = moment().startOf("day");
            var rangeEnd = moment(rangeStart).add(6, "months");
            var event = data[k];

      			if (event.type == 'VEVENT') {

              var title = event.summary;
      	      var startDate = moment(event.start);
      	      var endDate = moment(event.end);
              var duration = parseInt(endDate.format("x")) - parseInt(startDate.format("x"));

              if (typeof event.rrule === 'undefined' && moment(event.start).isSameOrAfter(moment(), 'day')) {
                // single events

                events.push({
                  calendar: calendar.name,
                  title: title,
                  startdate: event.start,
                  enddate: event.end,
                  duration: moment.duration(duration).humanize(),
                  location: event.location,
                  recurring: false
                });

              } else if (typeof event.rrule !== 'undefined') {
                // recurring events

                var dates = event.rrule.between(
          			  rangeStart.toDate(),
          			  rangeEnd.toDate(),
          			  true,
          			  function(date, i) {return true;}
          			)

                if (event.recurrences != undefined) {
          				for (var r in event.recurrences) {
          					if (moment(new Date(r)).isBetween(rangeStart, rangeEnd) != true) {
          						dates.push(new Date(r));
          					}
          				}
          			}

                for (var i in dates) {
          				var date = dates[i];
          				var curEvent = data[k];
          				var showRecurrence = true;
          				var curDuration = duration;

          				startDate = moment(date);

          				var dateLookupKey = date.toISOString().substring(0, 10);

          				if ((curEvent.recurrences != undefined) && (curEvent.recurrences[dateLookupKey] != undefined)) {
          					curEvent = curEvent.recurrences[dateLookupKey];
          					startDate = moment(curEvent.start);
          					curDuration = parseInt(moment(curEvent.end).format("x")) - parseInt(startDate.format("x"));
          				}	else if ((curEvent.exdate != undefined) && (curEvent.exdate[dateLookupKey] != undefined))	{
          					showRecurrence = false;
          				}

          				var recurrenceTitle = curEvent.summary;
                  var recurrenceLocation = curEvent.location;
          				endDate = moment(parseInt(startDate.format("x")) + curDuration, 'x');

          				if (endDate.isBefore(rangeStart) || startDate.isAfter(rangeEnd)) {
          					showRecurrence = false;
          				}

          				if (showRecurrence === true) {
                    events.push({
                      calendar: calendar.name,
                      title: recurrenceTitle,
                      startdate: startDate,
                      enddate: endDate,
                      duration: moment.duration(curDuration).humanize(),
                      location: recurrenceLocation,
                      recurring: true
                    });
          				}
          			}
              }
            }
          }
        }
      });
    }

    events.sort(function (left, right) {
      return moment(left.startdate).diff(moment(right.startdate))
    });

  }

  checkEvents() {
    this.log('check events ...');

  }
}

module.exports = CalendarApp;
