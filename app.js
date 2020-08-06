"use strict";

const Homey = require('homey');
const ical = require('node-ical');
const moment = require('moment');
const { promisify } = require('util');
var temp_events = [];
var events = [];

class CalendarApp extends Homey.App {

  onInit() {
    this.log('Initializing iCalendar for Homey App ...');

    // MOMENT
    if (this.homey.__("app.moment_locale") == 'nl') {
      moment.updateLocale('nl', {
        months : [ "januari", "februari", "maart", "april", "mei", "juni", "july", "augustus", "september", "oktober", "november", "december" ]
      });
    } else {
      moment.updateLocale('en', {
        months : [ "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December" ]
      });
    }

    // START EVENT UPDATES
    setTimeout(this.updateEvents.bind(this), 500);
    var interval = this.homey.settings.get("calendar_refresh_interval") || 5;
    this.updateEventsInterval = setInterval(this.updateEvents.bind(this), interval * 60 * 1000 + 500);

    // START TRIGGER CHECKS EVERY MINUTE
    this.checkEventsInterval = setInterval(this.checkEvents.bind(this), 60 * 1000);

    // SPEECH
    this.homey.speechInput.on('speechEval', function(speech, callback) {
      callback(null, true);
    });

    this.homey.speechInput.on('speechMatch', async (speech, onSpeechEvalData) => {
      this.log('speechMatch');
      let filtered_events = [];
      let type = 'dayschedule';

      var when = speech.matches.main.when.value[0];
      switch (when) {
        case 'today':
        case 'vandaag':
          filtered_events = await events.filter(event => moment(event.startdate).format('L') == moment().format('L'));
          break;
        case 'tomorrow':
        case 'morgen':
          filtered_events = await events.filter(event => moment(event.startdate).format('L') == moment().add(1, 'days').format('L'));
          break;
        case 'monday':
        case 'maandag':
        case 'tuesday':
        case 'dinsdag':
        case 'wednesday':
        case 'woensdag':
        case 'thursday':
        case 'donderdag':
        case 'friday':
        case 'vrijdag':
        case 'saturday':
        case 'zaterdag':
        case 'sunday':
        case 'zondag':
          switch (when) {
            case 'monday':
            case 'maandag':
              var day = 1;
              break;
            case 'tuesday':
            case 'dinsdag':
              var day = 2;
              break;
            case 'wednesday':
            case 'woensdag':
              var day = 3;
              break;
            case 'thursday':
            case 'donderdag':
              var day = 4;
              break;
            case 'friday':
            case 'vrijdag':
              var day = 5;
              break;
            case 'saturday':
            case 'zaterdag':
              var day = 6;
              break;
            case 'sunday':
            case 'zondag':
              var day = 7;
              break;
          }
          if (moment().isoWeekday() <= day) {
            var request_day = moment().isoWeekday(day);
          } else {
            var request_day = moment().add(1, 'weeks').isoWeekday(day);
          }
          filtered_events = await events.filter(event => moment(event.startdate).format('L') == moment(request_day).format('L'));
          break;
        default:
          this.log('when not recognized: ', when);
          filtered_events = await events.filter(event => moment(event.startdate).add(7, 'days').format('L') <= moment().format('L'));
          break;
      }

      var timespan = speech.matches.main.timespan.value[0];
      switch (timespan) {
        case 'first':
        case 'eerste':
          type = 'first';
          break;
        case 'next':
        case 'volgende':
          type = 'next';
          filtered_events = await events.filter(event => event.startdate > moment());
          break;
        case 'all':
        case 'al':
        case 'alle':
          break;
        default:
          break;
      }

      if (filtered_events.length > 0 && (type == 'next' || type == 'first')) {
        const speechedEvents = await this.speechEvents(type, filtered_events[0], filtered_events.length, when);
      } else if (filtered_events.length > 0) {
        const parsed_events = await this.parseEvents(filtered_events);
        const speechedEvents = await this.speechEvents(type, parsed_events, filtered_events.length, when);
      } else {
        const speechedEvents = await this.speechEvents('none', [], 0, when);
      }

    });

    // FLOW CARDS TRIGGERS
    this.homey.flow.getTriggerCard('trigger_next_appointment_in')
      .registerRunListener(async (args, state) => {
        let triggerTime = moment(state.startdate).subtract(args.timespan, 'minutes');
        let rangeStart = moment().subtract(30000, 'milliseconds');
        let rangeEnd = moment().add(30000, 'milliseconds');

        if ((args.calendar.id == 'all' || state.calendar == args.calendar.name) && moment(triggerTime).isBetween(rangeStart, rangeEnd)) {
          return Promise.resolve(true);
        } else {
          return Promise.resolve(false);
        }
      })
      .getArgument('calendar')
      .registerAutocompleteListener(async (query, args) => {
        return await this.getCalendars();
      })

    // FLOW CARDS ACTIONS
    this.homey.flow.getActionCard('action_next_appointment')
      .registerRunListener(async (args) => {
        let filtered_events = await events.filter(event => event.startdate > moment());
        if (args.calendar.id !== 'all') {
          filtered_events = filtered_events.filter(event => event.calendar == args.calendar.name);
        }
        return await this.speechEvents('next', filtered_events[0], 1, '');
      })
      .getArgument('calendar')
      .registerAutocompleteListener(async (query, args) => {
        return await this.getCalendars();
      })

    this.homey.flow.getActionCard('action_todays_appointments')
      .registerRunListener(async (args) => {
        let filtered_events = await events.filter(event => moment(event.startdate).format('L') == moment().format('L'));
        if (args.timespan == 'today_upcoming') {
          filtered_events = await filtered_events.filter(event => event.startdate > moment());
        }
        if (args.calendar.id !== 'all') {
          filtered_events = await filtered_events.filter(event => event.calendar == args.calendar.name);
        }
        if (filtered_events.length > 0) {
          const parsed_events = await this.parseEvents(filtered_events);
          return await this.speechEvents(args.timespan, parsed_events, filtered_events.length, this.homey.__("app.today"));
        } else {
          return await this.speechEvents('none', [], 0, this.homey.__("app.today"));
        }
      })
      .getArgument('calendar')
      .registerAutocompleteListener(async (query, args) => {
        return await this.getCalendars();
      })

    this.homey.flow.getActionCard('action_tomorrows_appointments')
      .registerRunListener(async (args) => {
        let filtered_events = await events.filter(event => moment(event.startdate).format('L') == moment().add(1, 'days').format('L'));
        if (args.calendar.id !== 'all') {
          filtered_events = await filtered_events.filter(event => event.calendar == args.calendar.name);
        }
        if (filtered_events.length > 0) {
          if (args.timespan == 'tomorrow_first') {
            return await this.speechEvents(args.timespan, filtered_events[0], 1, this.homey.__("app.tomorrow"));
          } else {
            const parsed_events = await this.parseEvents(filtered_events);
            return await this.speechEvents(args.timespan, parsed_events, filtered_events.length, this.homey.__("app.tomorrow"));
          }
        } else {
          return await this.speechEvents('none', [], 0, this.homey.__("app.tomorrow"));
        }
      })
      .getArgument('calendar')
      .registerAutocompleteListener(async (query, args) => {
        return await this.getCalendars();
      })

    this.homey.flow.getActionCard('action_dayschedule')
      .registerRunListener(async (args) => {
        if (moment().isoWeekday() <= args.dow) {
          var request_day = moment().isoWeekday(Number(args.dow));
        } else {
          var request_day = moment().add(1, 'weeks').isoWeekday(Number(args.dow));
        }
        switch (args.dow) {
          case '1':
            var day = this.homey.__("app.monday");
            break;
          case '2':
            var day = this.homey.__("app.tuesday");
            break;
          case '3':
            var day = this.homey.__("app.wednesday");
            break;
          case '4':
            var day = this.homey.__("app.thursday");
            break;
          case '5':
            var day = this.homey.__("app.friday");
            break;
          case '6':
            var day = this.homey.__("app.saturday");
            break;
          case '7':
            var day = this.homey.__("app.sunday");
            break;
        }
        let filtered_events = await events.filter(event => moment(event.startdate).format('L') == moment(request_day).format('L'));
        if (args.calendar.id !== 'all') {
          filtered_events = await filtered_events.filter(event => event.calendar == args.calendar.name);
        }
        if (filtered_events.length > 0) {
          const parsed_events = await this.parseEvents(filtered_events);
          return await this.speechEvents('dayschedule', parsed_events, filtered_events.length, day);
        } else {
          return await this.speechEvents('none', [], 0, day);
        }
      })
      .getArgument('calendar')
      .registerAutocompleteListener((query, args) => {
        return this.getCalendars();
      })

  }

  async updateEvents() {
    const calendars = this.homey.settings.get("calendars") || [];
    const icalFromURL = promisify(ical.fromURL);
    temp_events.length = 0;

    for (const calendar of calendars) {
      const data = await icalFromURL(calendar.url, {});

      for (let k in data) {
    		if (data.hasOwnProperty(k)) {

          var rangeStart = moment().startOf("day").local();
          var rangeEnd = moment(rangeStart).add(1, "months").local();
          var event = data[k];

    			if (event.type == 'VEVENT') {

            var startDate = moment(event.start);
    	      var endDate = moment(event.end);
            var duration = parseInt(endDate.format("x")) - parseInt(startDate.format("x"));

            if (typeof event.rrule === 'undefined' && moment(event.start).isSameOrAfter(moment(), 'day')) {
              // single events
              temp_events.push({
                calendar: calendar.name,
                title: event.summary,
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

                var recurrenceLocation = curEvent.location;
        				endDate = moment(parseInt(startDate.format("x")) + curDuration, 'x');

        				if (endDate.isBefore(rangeStart) || startDate.isAfter(rangeEnd)) {
        					showRecurrence = false;
        				}

        				if (showRecurrence === true) {

                  /* HACK FOR DST OFFSET FOR RECURRING EVENTS */
                  if(!moment(startDate).isDST()) {
                    startDate = moment(startDate).add(1, 'hours')
                  }

                  temp_events.push({
                    calendar: calendar.name,
                    title: curEvent.summary,
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
    }

    // update events with new events
    events = temp_events;

    // sorting events by date
    events.sort(function (left, right) {
      return moment(left.startdate).diff(moment(right.startdate))
    });

  }

  async checkEvents() {
    let filtered_events = await events.filter(event => moment(event.startdate).isBefore(moment().add(1440, 'm')));
    filtered_events = await filtered_events.filter(event => moment(event.startdate).isAfter(moment()));

    if (filtered_events.length > 0) {
      for (let event of filtered_events) {
        let date = moment(event.startdate).format('L');
        let time = moment(event.startdate).format('LT');

        let tokens = {
          'calendar': event.calendar,
          'date': date,
          'time': time,
          'title': event.title,
          'location': event.location || this.homey.__("app.not_available")
        }
        let state = {
          'calendar': event.calendar,
          'startdate': event.startdate
        }
        this.homey.flow.getTriggerCard('trigger_next_appointment_in').trigger(tokens, state);
      }
    }
  }

  getCalendars() {
    return new Promise((resolve, reject) => {
      const calendars = this.homey.settings.get("calendars") || [];
      const list = [];
      list.push({
        icon: '/app/icalendar.homey/assets/icon.svg',
        name: this.homey.__("app.all"),
        id: 'all'
      });
      for (const calendar of calendars) {
        list.push({
          icon: '/app/icalendar.homey/assets/icon.svg',
          name: calendar.name,
          id: calendar.name.replace(/\s/g, '')
        });
      }
      return resolve(list);
    });
  }

  speechEvents(type, events, number, timespan) {
    return new Promise(async (resolve, reject) => {
      if (number == 1) {
        var appointment = this.homey.__("app.appointment");
      } else {
        var appointment = this.homey.__("app.appointments");
      }

      switch(type) {
        case 'none':
          await this.homey.speechOutput.say(
            this.homey.__("app.no_appointments")
              .replace("{0}", timespan)
          );
          return resolve();
          break;
        case 'next':
          await this.homey.speechOutput.say(
            this.homey.__("app.next_appointment")
              .replace("{0}", events.title)
              .replace("{1}", moment(events.startdate).format('LL').substring(0, moment(events.startdate).format('LL').length - 5))
              .replace("{2}", moment(events.startdate).format('LT'))
          );
          return resolve();
          break;
        case 'first':
          await this.homey.speechOutput.say(
            this.homey.__("app.first_appointment")
              .replace("{0}", timespan)
              .replace("{1}", events.title)
              .replace("{2}", moment(events.startdate).format('LT'))
          );
          return resolve();
          break;
        case 'today_all':
          this.homey.speechOutput.say(
            this.homey.__("app.schedule_appointments")
              .replace("{0}", number)
              .replace("{1}", '')
              .replace("{2}", appointment)
              .replace("{3}", timespan)
          );
          var i = 0;
          for (let event of events) {
            i++
            await this.homey.speechOutput.say(event.string);
            if (i == events.length) {
              return resolve();
            }
          }
          break;
        case 'today_upcoming':
          this.homey.speechOutput.say(
            this.homey.__("app.schedule_appointments")
              .replace("{0}", number)
              .replace("{1}", this.homey.__("app.upcoming"))
              .replace("{2}", appointment)
              .replace("{3}", timespan)
          );
          var i = 0;
          for (let event of events) {
            i++
            await this.homey.speechOutput.say(event.string);
            if (i == events.length) {
              return resolve();
            }
          }
          break;
        case 'tomorrow_all':
          this.homey.speechOutput.say(
            this.homey.__("app.schedule_appointments")
              .replace("{0}", number)
              .replace("{1}", '')
              .replace("{2}", appointment)
              .replace("{3}", timespan)
          );
          var i = 0;
          for (let event of events) {
            i++
            await this.homey.speechOutput.say(event.string);
            if (i == events.length) {
              return resolve();
            }
          }
          break;
        case 'tomorrow_first':
          await this.homey.speechOutput.say(
            this.homey.__("app.tomorrows_first_appointment")
              .replace("{0}", events.title)
              .replace("{1}", moment(events.startdate).format('LT'))
          );
          return resolve();
          break;
        case 'dayschedule':
          this.homey.speechOutput.say(
            this.homey.__("app.schedule_appointments")
              .replace("{0}", number)
              .replace("{1}", '')
              .replace("{2}", appointment)
              .replace("{3}", timespan)
          );
          var i = 0;
          for (let event of events) {
            i++
            await this.homey.speechOutput.say(event.string);
            if (i == events.length) {
              return resolve();
            }
          }
          break;
        default:
          return reject('No event type given');
          break;
      }
      return resolve();
    });
  }

  parseEvents(events) {
    return new Promise((resolve, reject) => {
      let parsedEvent = '';
      let parsedEvents = [];
      var i = 0;
      for (let event of events) {
        i++
        let parsedEvent = '';
        if (events.length == 1 && moment(event.startdate).isBefore(moment())) {
          parsedEvent = this.homey.__("app.past_only_appointment");
        } else if (events.length == 1 && moment().isBefore(moment(event.startdate))) {
          parsedEvent = this.homey.__("app.upcoming_only_appointment");
        } else if (i == 1 && moment(event.startdate).isBefore(moment())) {
          parsedEvent = this.homey.__("app.past_first_appointment");
        } else if (i == 1 && moment().isBefore(moment(event.startdate))) {
          parsedEvent = this.homey.__("app.upcoming_first_appointment");
        } else if (i == events.length && moment(event.startdate).isBefore(moment())) {
          parsedEvent = this.homey.__("app.past_last_appointment");
        } else if (i == events.length && moment().isBefore(moment(event.startdate))) {
          parsedEvent = this.homey.__("app.upcoming_last_appointment");
        } else if (moment(event.startdate).isBefore(moment())) {
          parsedEvent = this.homey.__("app.past_next_appointment");
        } else {
          parsedEvent = this.homey.__("app.upcoming_next_appointment");
        }
        parsedEvent += this.homey.__("app.list_of_appointments")
          .replace("{0}", event.title)
          .replace("{1}", moment(event.startdate).format('LT'));
        parsedEvents.push({
          string: parsedEvent,
        });
      }
      return resolve(parsedEvents);
    });
  }

}

module.exports = CalendarApp;
