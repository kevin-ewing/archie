import { label, plaque, toCanvas } from '../ui/gauges.ts';
import { barnDesk, homePhoto } from './desk-art.ts';
import './barn.css';

const papers = [
  { title: 'Chart', text: 'The canal is marked in blue. The landing field is the small cross to the west.' },
  { title: 'Orders', text: 'Keep the field in sight on your first circuit. The strip is soft at the far end. — The Major' },
  { title: 'Letters', text: 'Your card came on Tuesday. The apple tree has come out all at once. I’ve put a photograph in with this. Write when you can. — Mother' },
  { title: 'Photo', text: 'The apple tree at home, May 1915.' },
  { title: 'Logbook', text: '10 May 1915. Arrived at Rook Field.' },
] as const;

export function openBarn(onClose: () => void) {
  const room = document.createElement('dialog');
  room.className = 'barn';
  room.setAttribute('aria-label', 'Rook Field barn');
  const desk = document.createElement('div');
  desk.className = 'barn-desk';
  const top = document.createElement('header');
  const title = label('ROOK FIELD / BARN', [232, 223, 196, 255]);
  title.setAttribute('aria-hidden', 'true');
  const button = (name: string, action: () => void) => {
    const control = document.createElement('button');
    control.type = 'button';
    control.setAttribute('aria-label', name);
    const face = plaque(name.toUpperCase());
    face.setAttribute('aria-hidden', 'true');
    control.append(face);
    control.addEventListener('click', action);
    return control;
  };
  top.append(title, button('Main menu', () => room.close()));
  const table = document.createElement('div');
  table.className = 'barn-table';
  const art = toCanvas(barnDesk());
  art.setAttribute('aria-hidden', 'true');
  table.append(art);
  const options = document.createElement('nav');
  options.setAttribute('aria-label', 'On the desk');
  table.append(options);
  const sheet = document.createElement('section');
  sheet.className = 'barn-sheet';
  sheet.hidden = true;
  for (const paper of papers) {
    const control = button(paper.title, () => {
      const heading = document.createElement('h2');
      heading.textContent = paper.title;
      heading.tabIndex = -1;
      const body = document.createElement('p');
      body.textContent = paper.text;
      const back = button('Back to desk', () => {
        sheet.hidden = true;
        options.inert = false;
        control.focus();
      });
      sheet.replaceChildren(heading, body);
      if (paper.title === 'Photo') {
        const photo = toCanvas(homePhoto());
        photo.setAttribute('role', 'img');
        photo.setAttribute('aria-label', 'An apple tree in blossom in the garden at home');
        sheet.append(photo);
      }
      sheet.append(back);
      sheet.hidden = false;
      options.inert = true;
      heading.focus();
    });
    options.append(control);
  }
  desk.append(top, table, sheet);
  room.append(desk);
  room.addEventListener('close', () => {
    room.remove();
    onClose();
  }, { once: true });
  document.body.append(room);
  room.showModal();
  return room;
}
