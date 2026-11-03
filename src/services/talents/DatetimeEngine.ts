import {TalentEngine, TalentResult, ToolDefinition} from './types';

const deviceTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/**
 * Wall-clock parts of `date` in `timeZone`. Intl is the source of truth for
 * tz math; dayjs-timezone is unreliable on Hermes because it depends on ICU
 * internals that aren't fully exposed. Intl.DateTimeFormat also throws
 * RangeError for unknown zones, which doubles as validation.
 */
const clockParts = (timeZone: string, date: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00';
  // Small models get the weekday wrong when left to compute it.
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
  }).format(date);
  return {
    weekday,
    day: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
    seconds: get('second'),
  };
};

/**
 * Crampon: the phone's date and time, put straight into the prompt when the
 * question is about them. A 1B model asked "what time is it?" with only a
 * tool to find out can announce the call forever without making it; handed
 * the answer, it just reads it.
 */
export const deviceClockNote = (now: Date): string => {
  const timeZone = deviceTimeZone();
  const {weekday, day, time} = clockParts(timeZone, now);
  return `Current date and time on the user's phone: ${weekday} ${day}, ${time} (${timeZone}). Answer questions about the date or time from it.`;
};

export class DatetimeEngine implements TalentEngine {
  readonly name = 'datetime';

  async execute(args: Record<string, any>): Promise<TalentResult> {
    const tz = typeof args.timezone === 'string' ? args.timezone : undefined;
    const effectiveTz = tz ?? deviceTimeZone();

    try {
      const {weekday, day, time, seconds} = clockParts(effectiveTz, new Date());
      const summary = `${weekday} ${day}T${time}:${seconds} (${effectiveTz})`;
      return {type: 'text', summary};
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return {
        type: 'error',
        summary: `datetime: ${errMsg}. If you can recover using correct arguments, retry. Otherwise, give up.`,
        errorMessage: errMsg,
      };
    }
  }

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'datetime',
        description:
          'Get the current date and time. Defaults to the device timezone.',
        parameters: {
          type: 'object',
          properties: {
            timezone: {
              type: 'string',
              description:
                'Optional IANA timezone (e.g. "Asia/Tokyo"). Use the canonical zone for the country (Germany → "Europe/Berlin"). Omit to get device time.',
            },
          },
        },
      },
    };
  }
}
