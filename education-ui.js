import {EDUCATION_CARDS,EDUCATION_CONTEXT} from './game-education.js';

const stone={title:'The cornerstone',text:'And there is a mystery about this stone, seeing that whoso falls upon it, while he is thereby broken in pieces, shall be saved; but on whomsoever this stone falls, he will be ground to dust and his ashes scattered to the four winds.',quote:true,article:{title:'The Urantia Book · 173:4.4',url:'https://multilanguagebook.urantia.org/Est/Eng/papers/173'},context:'Exact quotation, verified against 173:4.4. Gray Rock is an invented game move inspired by your idea; the book does not name that technique.'};
// Stone wording verified CLEAN with ub_tools.ub_verify_text; source/context in research/gray-rock-source.json.
export function installEducation({isPlaying,togglePause}){
  const cards=[...EDUCATION_CARDS,stone];let index=0,resumeAfter=false,previousFocus;
  const section=document.createElement('section');section.id='education';section.className='modal hidden';section.setAttribute('role','dialog');section.setAttribute('aria-modal','true');section.setAttribute('aria-labelledby','lesson-title');
  section.innerHTML='<div class="lesson-panel"><span class="eyebrow">REBELLION TESTED · OPTIONAL READING</span><h2 id="lesson-title"></h2><p id="lesson-text"></p><p id="lesson-context" class="lesson-context"></p><a id="lesson-source" target="_blank" rel="noopener noreferrer"></a><nav class="lesson-nav"><button id="lesson-prev" class="text-button">← Previous</button><span id="lesson-number"></span><button id="lesson-next" class="text-button">Next →</button></nav><button id="lesson-close" class="primary">BACK TO THE GAME ↗</button><small class="lesson-note"></small></div>';
  document.querySelector('#app').append(section);
  const find=id=>section.querySelector('#'+id);
  function render(){const card=cards[index];find('lesson-title').textContent=card.title;find('lesson-text').textContent=card.quote?'“'+card.text+'”':card.text;find('lesson-source').textContent=card.article.title;find('lesson-source').href=card.article.url;find('lesson-context').textContent=card.context||'From Derek Samaras’ Rebellion Tested series.';find('lesson-number').textContent=`${index+1} / ${cards.length}`;section.querySelector('.lesson-note').textContent=EDUCATION_CONTEXT.bossFictionNotice;}
  function open(){previousFocus=document.activeElement;resumeAfter=isPlaying();if(resumeAfter)togglePause();render();section.classList.remove('hidden');find('lesson-close').focus();}
  function close(){section.classList.add('hidden');if(resumeAfter)togglePause();resumeAfter=false;previousFocus?.focus();}
  find('lesson-close').onclick=close;find('lesson-prev').onclick=()=>{index=(index+cards.length-1)%cards.length;render();};find('lesson-next').onclick=()=>{index=(index+1)%cards.length;render();};
  section.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();e.preventDefault();close();}if(e.key==='Tab'){const focusable=[...section.querySelectorAll('a,button')];const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  for(const container of ['#intro','#pause-screen>div','#results>div']){const button=document.createElement('button');button.className='text-button education-open';button.textContent='Rebellion Tested · the ideas behind the game';button.onclick=open;document.querySelector(container).append(button);}
  return {open,close};
}
