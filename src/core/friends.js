import * as account from './account.js';
import { listGames } from './registry.js';

/**
 * The friends panel: claim a name, find people, and send challenges.
 *
 * Every name on this screen came from another player, so it is only ever put
 * on the page as text. Nothing here builds markup out of anything the server
 * said.
 */

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const button = (label, className = 'btn') => {
  const node = el('button', className, label);
  node.type = 'button';
  return node;
};

export class FriendsPanel {
  constructor({ onMatchStart }) {
    this.onMatchStart = onMatchStart;
    this.root = document.getElementById('overlay-friends');
    this.body = document.getElementById('friends-body');
    this.pill = document.getElementById('btn-account');
    this.pillName = document.getElementById('account-name');
    this.dot = document.getElementById('account-dot');
    this.open = false;
    this.notice = null;
    this.pendingChallenge = null;   // one we sent, waiting on an answer

    this.pill.addEventListener('click', () => this.toggle());
    document.getElementById('btn-friends-close').addEventListener('click', () => this.hide());
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) this.hide();
    });

    account.subscribe(() => this._paint());
    account.on('challenge', (data) => this._say(`${data.fromPlayer?.name || 'Someone'} challenged you`, 'good'));
    account.on('challenge-declined', (data) => this._say(`${data.byPlayer?.name || 'They'} said no`, 'bad'));
    account.on('friend-request', (data) => this._say(`${data.name} wants to be friends`, 'good'));
    account.on('friend-accepted', (data) => this._say(`${data.name} is now a friend`, 'good'));
    account.on('match-start', (data) => {
      this.pendingChallenge = null;
      this.hide();
      this.onMatchStart(data);
    });
  }

  toggle() {
    if (this.open) this.hide();
    else this.show();
  }

  show() {
    this.open = true;
    this.root.hidden = false;
    if (account.signedIn()) account.refresh().catch(() => {});
    this._paint();
    // Say up front whether there is a server behind this copy, rather than
    // letting someone type a name and then get an error.
    if (!account.signedIn()) {
      account.reachable().then((ok) => {
        if (this.serverUp === ok) return;
        this.serverUp = ok;
        this._paint();
      });
    }
  }

  hide() {
    this.open = false;
    this.root.hidden = true;
  }

  _say(text, tone = 'good') {
    this.notice = { text, tone };
    this._paint();
    clearTimeout(this._noticeTimer);
    this._noticeTimer = setTimeout(() => {
      this.notice = null;
      this._paint();
    }, 6000);
  }

  async _run(action, done) {
    try {
      const result = await action();
      if (done) done(result);
    } catch (error) {
      this._say(this._explain(error), 'bad');
    }
  }

  _explain(error) {
    const said = {
      'bad-name': 'Names are 3-16 letters, numbers, spaces, - or _',
      'name-taken': 'Someone already has that name',
      'no-such-player': 'Nobody by that name',
      'already-friends': 'You are already friends',
      'already-asked': 'You already asked them',
      'not-friends': 'You can only challenge a friend',
      'already-challenged': 'There is already a challenge between you',
      'no-name-yet': 'This browser has no name on the server any more',
      'slow-down': 'Too fast - give it a second',
      self: 'You cannot friend yourself',
    }[error.code];
    if (said) return said;
    return `Cannot reach the server at ${account.getState().server}`;
  }

  /* ------------------------------------------------------------ painting */

  _paint() {
    const state = account.getState();

    this.pillName.textContent = state.player ? state.player.name : 'Set a name';
    this.dot.className = `account-dot${state.connected ? ' is-online' : ''}`;
    const waiting = state.roster.incoming.length + state.roster.challenges.incoming.length;
    this.pill.classList.toggle('has-news', waiting > 0);
    this.pill.dataset.count = waiting > 0 ? String(waiting) : '';

    if (!this.open) return;
    this.body.replaceChildren();
    if (this.notice) {
      this.body.append(el('p', `friends-notice is-${this.notice.tone}`, this.notice.text));
    }
    if (!account.signedIn()) this._paintSignup(state);
    else this._paintRoster(state);
  }

  _paintSignup(state) {
    if (this.serverUp === false) {
      this.body.append(this._noServerNote(state));
      this.body.append(this._serverRow(state));
      return;
    }
    this.body.append(el('p', 'friends-lead', 'Pick a name and other players can find you, add you as a friend and challenge you to any of the games.'));

    const form = el('form', 'friends-form');
    const input = el('input', 'friends-input');
    input.type = 'text';
    input.placeholder = 'Your name';
    input.maxLength = 16;
    input.autocomplete = 'off';
    const go = button('Claim it', 'btn btn--primary');
    go.type = 'submit';
    form.append(input, go);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!input.value.trim()) return;
      this._run(() => account.claimName(input.value), () => this._say('That name is yours', 'good'));
    });
    this.body.append(form);

    this.body.append(this._serverRow(state));
    this.body.append(el('p', 'friends-fineprint', 'Your name is kept on the friends server along with who your friends are. There is no password: this browser holds a key the server gave it, so keep playing on this device, and clearing site data means picking a new name.'));
  }

  /** What to say when this copy of the game has nothing behind it. */
  _noServerNote(state) {
    const box = el('div', 'friends-empty');
    box.append(el('h3', 'friends-heading', 'No friends server behind this copy'));
    box.append(el('p', 'friends-lead',
      'Friends and challenges need a small server to hold the names. This page came from '
      + `${state.server || 'a file on your computer'}, which only serves the game itself.`));
    box.append(el('p', 'friends-lead', 'Start one and open the game from it:'));
    const code = el('pre', 'friends-code', 'npm run server\n\nthen open  http://localhost:8787');
    box.append(code);
    box.append(el('p', 'friends-lead',
      'Everything is at that one address - the game, your name and your friends - so nothing here needs setting. '
      + 'Someone else on the same wifi can join by using your computer\u2019s address instead of localhost.'));
    box.append(el('p', 'friends-fineprint',
      'To play someone who is not on your network the server has to live somewhere online, with https. server/README.md walks through it.'));
    return box;
  }

  _serverRow(state) {
    const row = el('div', 'friends-server');
    row.append(el('label', 'friends-label', 'Friends server'));
    const input = el('input', 'friends-input');
    input.type = 'url';
    input.value = state.server;
    input.spellcheck = false;
    const save = button('Use this');
    save.addEventListener('click', () => {
      account.setServer(input.value);
      account.disconnect();
      account.restore();
      this._say('Server set', 'good');
    });
    row.append(input, save);
    return row;
  }

  _paintRoster(state) {
    const head = el('div', 'friends-head');
    const who = el('div', 'friends-who');
    who.append(el('strong', null, state.player.name));
    who.append(el('span', 'friends-record', `${state.player.wins ?? 0}W / ${state.player.losses ?? 0}L`));
    head.append(who);
    head.append(el('span', `friends-status${state.connected ? ' is-online' : ''}`, state.connected ? 'Connected' : 'Offline'));
    this.body.append(head);

    // Someone has challenged you.
    for (const challenge of state.roster.challenges.incoming) {
      const card = el('div', 'friends-card is-challenge');
      card.append(el('span', null, `${challenge.fromPlayer?.name || 'Someone'} challenges you to ${this._gameName(challenge.gameId)}`));
      const actions = el('div', 'friends-actions');
      const accept = button('Accept', 'btn btn--primary');
      accept.addEventListener('click', () => this._run(
        () => account.answerChallenge(challenge.id, true),
        (result) => { if (result.match) { this.hide(); this.onMatchStart(result); } },
      ));
      const no = button('No thanks');
      no.addEventListener('click', () => this._run(() => account.answerChallenge(challenge.id, false), () => account.refresh()));
      actions.append(accept, no);
      card.append(actions);
      this.body.append(card);
    }

    // One you sent, still unanswered.
    for (const challenge of state.roster.challenges.outgoing) {
      const card = el('div', 'friends-card');
      card.append(el('span', null, `Waiting on ${challenge.toPlayer?.name || 'them'} - ${this._gameName(challenge.gameId)}`));
      const cancel = button('Take it back');
      cancel.addEventListener('click', () => this._run(() => account.cancelChallenge(challenge.id), () => account.refresh()));
      card.append(cancel);
      this.body.append(card);
    }

    // People asking to be friends.
    for (const person of state.roster.incoming) {
      const card = el('div', 'friends-card');
      card.append(el('span', null, `${person.name} wants to be friends`));
      const actions = el('div', 'friends-actions');
      const yes = button('Add', 'btn btn--primary');
      yes.addEventListener('click', () => this._run(() => account.answerFriend(person.id, true)));
      const no = button('Ignore');
      no.addEventListener('click', () => this._run(() => account.answerFriend(person.id, false)));
      actions.append(yes, no);
      card.append(actions);
      this.body.append(card);
    }

    this.body.append(this._addForm());

    this.body.append(el('h3', 'friends-heading', `Friends (${state.roster.friends.length})`));
    if (state.roster.friends.length === 0) {
      this.body.append(el('p', 'friends-lead', 'Nobody yet. Add someone by their name above.'));
    }
    for (const friend of state.roster.friends) {
      this.body.append(this._friendRow(friend, state));
    }
    for (const person of state.roster.outgoing) {
      const card = el('div', 'friends-card is-quiet');
      card.append(el('span', null, `Asked ${person.name}`));
      this.body.append(card);
    }

    const foot = el('div', 'friends-foot');
    const out = button('Forget my name on this device');
    out.addEventListener('click', () => {
      account.signOut();
      this._say('Signed out on this device', 'good');
    });
    foot.append(out);
    this.body.append(foot);
  }

  _addForm() {
    const form = el('form', 'friends-form');
    const input = el('input', 'friends-input');
    input.type = 'text';
    input.placeholder = "A friend's name";
    input.maxLength = 16;
    input.autocomplete = 'off';
    const add = button('Add friend', 'btn btn--primary');
    add.type = 'submit';
    form.append(input, add);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = input.value.trim();
      if (!name) return;
      this._run(() => account.askToBeFriends(name), (result) => {
        input.value = '';
        this._say(result.accepted ? `You and ${name} are friends` : `Asked ${name}`, 'good');
      });
    });
    return form;
  }

  _friendRow(friend, state) {
    const card = el('div', 'friends-card');
    const who = el('div', 'friends-who');
    const dot = el('span', `account-dot${friend.online ? ' is-online' : ''}`);
    who.append(dot, el('strong', null, friend.name));
    who.append(el('span', 'friends-record', `${friend.wins}W / ${friend.losses}L`));
    card.append(who);

    const actions = el('div', 'friends-actions');
    const picker = el('select', 'friends-pick');
    for (const def of listGames()) {
      if (def.status === 'coming-soon') continue;
      const option = el('option', null, def.name);
      option.value = def.id;
      picker.append(option);
    }
    const pending = state.roster.challenges.outgoing.some((c) => c.to === friend.id);
    const go = button('Challenge', 'btn btn--primary');
    go.disabled = !friend.online || pending;
    go.title = friend.online ? '' : 'They are not online right now';
    go.addEventListener('click', () => this._run(
      () => account.challenge(friend.id, picker.value),
      () => { this._say(`Challenge sent to ${friend.name}`, 'good'); account.refresh(); },
    ));
    const drop = button('Remove');
    drop.addEventListener('click', () => this._run(() => account.removeFriend(friend.id)));
    actions.append(picker, go, drop);
    card.append(actions);
    return card;
  }

  _gameName(gameId) {
    const def = listGames().find((entry) => entry.id === gameId);
    return def ? def.name : gameId;
  }
}
