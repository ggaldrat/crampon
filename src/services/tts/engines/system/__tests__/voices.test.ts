import {pickSystemVoice, type SystemVoiceInfo} from '../voices';

const voice = (
  identifier: string,
  language: string,
  extra: Partial<SystemVoiceInfo> = {},
): SystemVoiceInfo => ({identifier, name: identifier, language, ...extra});

describe('pickSystemVoice', () => {
  it('keeps the phone language and prefers its exact region', () => {
    const picked = pickSystemVoice(
      [
        voice('en-us-x-sfg-local', 'en-US'),
        voice('fr-ca-x-cab-local', 'fr-CA'),
        voice('fr-fr-x-frc-local', 'fr-FR'),
      ],
      'fr-FR',
    );
    expect(picked).toEqual({
      id: 'fr-fr-x-frc-local',
      name: 'fr-fr-x-frc-local',
      engine: 'system',
      language: 'fr-FR',
    });
  });

  it('falls back to another region of the same language', () => {
    const picked = pickSystemVoice(
      [voice('en-us', 'en-US'), voice('fr-ca', 'fr-CA')],
      'fr-FR',
    );
    expect(picked?.id).toBe('fr-ca');
  });

  it('never picks a voice that sends text to a server', () => {
    const picked = pickSystemVoice(
      [
        voice('fr-fr-network', 'fr-FR', {
          requiresNetwork: true,
          quality: 'Enhanced',
        }),
        voice('fr-fr-local', 'fr-FR'),
      ],
      'fr-FR',
    );
    expect(picked?.id).toBe('fr-fr-local');
  });

  it('skips voices whose data is not on the phone', () => {
    const picked = pickSystemVoice(
      [voice('fr-fr-missing', 'fr-FR', {notInstalled: true})],
      'fr-FR',
    );
    expect(picked).toBeNull();
  });

  it('prefers an enhanced voice within the same region', () => {
    const picked = pickSystemVoice(
      [
        voice('fr-fr-default', 'fr-FR'),
        voice('fr-fr-enhanced', 'fr-FR', {quality: 'Enhanced'}),
      ],
      'fr-FR',
    );
    expect(picked?.id).toBe('fr-fr-enhanced');
  });

  it('returns null when no voice speaks the phone language', () => {
    expect(pickSystemVoice([voice('en-us', 'en-US')], 'fr-FR')).toBeNull();
  });
});
