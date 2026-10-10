// StickySound for schools: the parent survey where every second question is for the child.
import { createApp } from './app.js';
import { createSchoolScenario } from './scenarios/school.js';

// The school's name can be set per link: school.html?school=Oakfield%20Prep
const params = new URLSearchParams(location.search);
const schoolName = (params.get('school') || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40) || 'Elmwood Academy';
document.querySelectorAll('[data-school-name]').forEach((n) => (n.textContent = schoolName));
document.title = `${schoolName} · parent survey with a song for your child`;

createApp(createSchoolScenario({ schoolName }));
