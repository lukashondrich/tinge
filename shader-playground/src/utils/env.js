const params = new URLSearchParams(window.location.search);
const queryFlag = params.get('textMode');
const envFlag = import.meta.env.VITE_TEXT_MODE;
export const TEXT_MODE = queryFlag === '1' || envFlag === '1' || envFlag === 'true';
