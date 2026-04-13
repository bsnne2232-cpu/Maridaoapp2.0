# TODO - MISSÃO COMPLETA Maridão App 2.0 (aprovado)

## [x] 1. Criado este TODO.md

## [ ] 2. Fix Chat Bookings (sumiço abas)
- js/chat.js: Unificar showMyBookings() com Map merge
- Aba Andamento: !completed && (status ativo || track ativo)
- Aba Histórico: completed/cancelled

## [ ] 3. Negociação Limpa
- js/chat.js: _autoAgree() equal budgets → agreedPrice + lock UI
- Post-pay block new proposals
- Remove 'Contraproposta' buttons

## [x] 4. Código Incorreto (zeros)
- js/pro-dashboard.js: _submitArrivalCode, _proArrModalNext, pArrNext → trim ONLY ✓
- js/tracking.js: aNext() → trim ONLY ✓
- worker/src/index.js: code.trim() replace(/\D/g,'') ✓

## [x] 5. Admin Panel ✓
- admin.html criado com aprovação/rejeição
- Lista docsStatus pending/rejected

## [ ] 6. UX/Comissão
- All buttons: disabled + spinner após click
- payment.js: Math.round() commissions

## [ ] 7. Update TODO.md

## [ ] 8. Test full flow (0123 code → em andamento)

## [ ] 9. Git commit + gh pr create (blackboxai/fix-complete)

## [ ] 10. attempt_completion
