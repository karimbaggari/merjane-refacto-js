### Consignes JS:

- Si probleme de version pnpm, utiliser `corepack enable pnpm` qui devrait automatiquement utiliser la bonne version
- Ne pas modifier les classes qui ont un commentaire: `// WARN: Should not be changed during the exercise
`
- Pour lancer les tests: `pnpm test`
  - integration only in watch mode `pnpm test:integration`
  - unit only in watch mode `pnpm test:unit`

---

## Le projet

Merjane gere un inventaire de produits. On traite des commandes, chaque commande contient des produits. Chaque produit a un stock (`available`) et un delai fournisseur (`leadTime`).

3 types de produits :
- **NORMAL** — en stock on decremente, en rupture on notifie le delai (sauf si leadTime = 0)
- **SEASONAL** — pareil mais uniquement pendant la saison. Si le delai depasse la fin de saison, rupture. Si la saison n'a pas commence, rupture mais on garde le stock.
- **EXPIRABLE** — pareil mais si le produit est expire, on bloque et on vide le stock.

## Demarrage rapide

```bash
corepack enable pnpm
pnpm install
pnpm dev
```

Endpoint unique : `POST /orders/:orderId/processOrder`

## Tests

```bash
pnpm test                   # tout
pnpm test:unit --run        # unitaires
pnpm test:integration --run # integration
```

## Structure du code

```
controllers/   → HTTP uniquement
services/impl/ → orchestration (quel type ? quelle action ?)
validators/    → fonctions pures (isExpired, isInSeason, etc.)
helpers/       → actions metier (decrementStock, clearInventory, notify)
repositories/  → acces base de donnees
constants/     → valeurs partagees
```

Le controller ne touche pas au metier. Le service ne touche pas au SQL. Le repository ne decide rien. Chaque couche fait un seul truc.

Le routage par type se fait via un switch dans le service. Un pattern strategy aurait ete overkill pour 3 types — a revoir si on en ajoute un 4e.

Les validateurs sont des fonctions pures sans dependance. Les helpers font une action chacun, le service les compose (`clearInventory` + `notifyOutOfStock` plutot qu'une methode qui fait les deux).

## Choix faits pendant le refacto

- Quand la saison n'a pas commence, on garde le stock (comportement original)
- Un produit qui expire aujourd'hui est considere expire (`expiryDate <= now`)
- NORMAL en rupture avec leadTime a 0 : aucune action, pas d'erreur
- Le service de notification est un stub fourni par l'exercice, pas touche
- Les tests unitaires utilisent un vrai SQLite (scaffolding fourni)
