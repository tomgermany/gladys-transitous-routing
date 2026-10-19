# Transitous Intégration des départs en transit pour Gladys

## Il vous faut :

Gladys Assistant > Version 5.2
Intégration externe des départs en transit
Accès Internet pour votre installation de Gladys Assistant

Example:

![Lissabon – Beispielansicht der Transitous-Integration](../test/lissabon.png)

Résultat : six vignettes affichent dans un premier temps, une seule fois, l'arrêt le plus proche dans chaque catégorie. À savoir : l'arrêt de bus le plus proche, le ferry le plus proche, l'arrêt de transport ferroviaire le plus proche.
Ensuite, le prochain départ depuis cet arrêt s'affiche.
Cela signifie que s'il n'y a qu'un seul arrêt dans votre périmètre de recherche, vous obtiendrez les six prochains départs.
Si plusieurs arrêts sont trouvés, ceux-ci s’affichent avec un code couleur.

## Vous obtenez :

Vous recevrez une intégration externe pour Galdys Assistant. 
Cette intégration affiche automatiquement les 6 prochains départs
des transports en commun dans un widget clair et facile à lire,
qu’il s’agisse de bus, de trains, de ferries ou de tramways.
Le tout dans un rayon configurable autour de votre domicile.

## Configuration

1. Installez l'intégration externe soit via Gladys Assistant (recommandé),
 soit dans Gladys Assistant avec un accès direct à GitHub.
3. Une fois l'installation terminée, vérifiez que l'intégration fonctionne correctement.
4. Ouvrez votre tableau de bord, passez en mode Édition, puis ajoutez-y le nouveau widget.
   Sélectionnez ce widget d'intégration.
5. Lorsque vous ajoutez le widget à votre tableau de bord, vous devrez fournir certaines informations :
a.) Votre géolocalisation comme point de départ
 (la prochaine phase de développement vous permettra d’importer des données depuis Gladys Assistant)
b.) Le diamètre du rayon de recherche.
c.) L’intervalle de rafraîchissement, par tranches de 10 minutes.
d.) Un identifiant unique pour accéder à l’API sur https://transitous.org/.
Cet identifiant doit être unique — par exemple, une adresse e-mail ou un site web.
Il est enregistré par l'intégration uniquement dans le champ de configuration prévu à cet effet.
L'intégration ne récupère ni ne consigne cet identifiant.
Tout reste entre vos mains. Transitous.org utilise cet identifiant pour gérer la charge sur son infrastructure informatique.
Tenez compte du fournisseur de données lorsque vous définissez ce paramètre. Nous recommandons une durée de 15 minutes.
6. Après avoir renseigné ces informations, enregistrez-les et placez le widget à l'endroit de votre choix.

## Dépannage

L'intégration consigne toutes ses opérations : consultez les journaux d'intégration depuis l'
interface utilisateur de Gladys (ou via la commande `docker logs` sur l'hôte) avec l'option `LOG_LEVEL=debug` pour obtenir tous les
détails.
