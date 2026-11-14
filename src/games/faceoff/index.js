import { registerGame } from '../../core/registry.js';
import { createFaceoff, GAME_ID } from './game.js';

registerGame({
  id: GAME_ID,
  name: 'Faceoff',
  tagline: 'Pick three, send them out one at a time, and watch whether you were right.',
  description: 'Nine fighters, three of them yours. You choose who and in what order, then it plays itself out.',
  howTo: [
    'Pick <strong>three of the nine</strong>. The order matters - the first one you choose walks out first.',
    'Only <strong>one from each side fights at a time</strong>. When yours falls, the next one in your three steps up.',
    'Nobody takes turns. Each fighter <strong>fills a bar at its own speed</strong> and acts the moment it is full, so a quick one simply gets more goes.',
    'Every few goes a fighter does <strong>its own thing</strong> instead of hitting - healing the bench, setting a poison, stealing the other one&apos;s go.',
    'You do not steer any of it. <strong>The picks and the order are the whole decision.</strong> Click to watch it faster.',
    'If a fight drags, <strong>everything starts hitting harder</strong> until somebody goes down.',
    '<strong>Sandbox</strong> is one fight against whoever turns up. <strong>Tower</strong> is ten floors, carrying your wounds up. <strong>Story</strong> is six fights that each answer the last.',
  ],
  create: createFaceoff,
});
