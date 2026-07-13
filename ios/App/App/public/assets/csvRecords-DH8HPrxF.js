function u(c){const i=c.replace(/^\uFEFF/,""),r=[];let t=[],l="",o=!1;const n=()=>{t.push(l.trim()),l=""},f=()=>{t.length>0&&t.some(e=>e.length>0)&&r.push(t),t=[]};for(let e=0;e<i.length;e++){const s=i[e];o?s==='"'?i[e+1]==='"'?(l+='"',e++):o=!1:l+=s:s==='"'?o=!0:s===","?n():s==="\r"&&i[e+1]===`
`?(n(),f(),e++):s===`
`||s==="\r"?(n(),f()):l+=s}return n(),f(),r}export{u as p};
