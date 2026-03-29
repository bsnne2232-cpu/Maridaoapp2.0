// === CITIES DATABASE ===
const CITIES={"São Paulo":[-23.55,-46.63],"Rio de Janeiro":[-22.91,-43.17],"Belo Horizonte":[-19.92,-43.94],"Brasília":[-15.78,-47.93],"Salvador":[-12.97,-38.51],"Fortaleza":[-3.72,-38.52],"Curitiba":[-25.43,-49.27],"Recife":[-8.05,-34.87],"Campinas":[-22.91,-47.06],"Santos":[-23.96,-46.33],"São Bernardo":[-23.69,-46.56],"Guarulhos":[-23.46,-46.53],"Osasco":[-23.53,-46.79],"Ribeirão Preto":[-21.18,-47.81],"Sorocaba":[-23.50,-47.46],"São José dos Campos":[-23.18,-45.88],"Jundiaí":[-23.19,-46.88],"Piracicaba":[-22.73,-47.65],"Bauru":[-22.31,-49.07],"Franca":[-20.54,-47.40],"São Pedro":[-22.55,-47.91],"Limeira":[-22.56,-47.40],"Americana":[-22.74,-47.33],"São Carlos":[-22.02,-47.89],"Araraquara":[-21.79,-48.18],"Presidente Prudente":[-22.13,-51.39],"Marília":[-22.21,-49.95],"São José do Rio Preto":[-20.82,-49.38],"Taubaté":[-23.03,-45.56],"Mogi das Cruzes":[-23.52,-46.19],"Porto Alegre":[-30.03,-51.23],"Florianópolis":[-27.60,-48.55],"Goiânia":[-16.68,-49.26],"Manaus":[-3.12,-60.02],"Belém":[-1.46,-48.50],"Vitória":[-20.32,-40.34],"Natal":[-5.79,-35.21],"Maceió":[-9.67,-35.74],"João Pessoa":[-7.12,-34.86],"Cuiabá":[-15.60,-56.10],"Campo Grande":[-20.44,-54.65],"Londrina":[-23.31,-51.16],"Joinville":[-26.30,-48.85],"Uberlândia":[-18.92,-48.28],"Niterói":[-22.88,-43.10],"Maringá":[-23.42,-51.94],"Cascavel":[-24.96,-53.46],"Foz do Iguaçu":[-25.55,-54.59]};

// === HELPERS ===
function norm(s) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
function hav(a, b, c, d) {
  const R = 6371, dL = (c - a) * Math.PI / 180, dN = (d - b) * Math.PI / 180;
  const x = Math.sin(dL / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(dN / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
const cNames = Object.keys(CITIES), cNorm = cNames.map(norm);

// === AUTOCOMPLETE ===
function setupAC(iid, lid) {
  const inp = document.getElementById(iid), list = document.getElementById(lid);
  inp.addEventListener('input', () => {
    const v = norm(inp.value);
    if (v.length < 2) { list.innerHTML = ''; list.style.display = 'none'; return; }
    const m = []; cNorm.forEach((n, i) => { if (n.includes(v)) m.push(cNames[i]); });
    list.innerHTML = m.slice(0, 8).map(c =>
      `<div style="padding:8px 14px;cursor:pointer;font-size:.85rem;transition:background .2s" onmouseover="this.style.background='var(--pl)'" onmouseout="this.style.background=''" onclick="document.getElementById('${iid}').value='${c.replace(/'/g, "\\'")}';document.getElementById('${lid}').style.display='none';calcCarreto()">${c}</div>`
    ).join('');
    list.style.display = m.length ? 'block' : 'none';
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#' + iid) && !e.target.closest('#' + lid)) list.style.display = 'none';
  });
}

// === CALCULATE CARRETO PRICE ===
function calcCarreto() {
  const f = document.getElementById('cFrom').value, t = document.getElementById('cTo').value;
  if (!CITIES[f] || !CITIES[t]) return;
  const [a, b] = CITIES[f], [c, d] = CITIES[t], dist = hav(a, b, c, d) * 1.4;
  const mt = parseFloat(document.getElementById('cType').value);
  const types = { '1': 'Pequenos', '1.2': 'Médio', '1.4': 'Grande', '1.7': 'Mudança' };
  const total = 60 + dist * 4.50 * mt;
  document.getElementById('eDist').textContent = dist.toFixed(0) + ' km';
  document.getElementById('eCargo').textContent = types[mt + '' || document.getElementById('cType').value];
  document.getElementById('eTotal').textContent = 'R$ ' + total.toFixed(2);
  document.getElementById('cEstimate').style.display = 'block';
}
