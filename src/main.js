import { Shell } from './core/shell.js';
import './games/catchmon/index.js';
import './games/nopoly/index.js';
import './games/shubat/index.js';
import './games/defensele/index.js';

const shell = new Shell();
shell.showMenu();
shell.startFriends();

// Handy while developing in the browser console.
window.minigameMania = shell;
