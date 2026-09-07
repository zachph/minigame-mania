import { Shell } from './core/shell.js';
import './games/catchmon/index.js';
import './games/nopoly/index.js';
import './games/shubat/index.js';

const shell = new Shell();
shell.showMenu();

// Handy while developing in the browser console.
window.minigameMania = shell;
