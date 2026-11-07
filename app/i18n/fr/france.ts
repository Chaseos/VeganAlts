import type { Dictionary } from "..";

// What differs from the Canadian French in France, Belgium, Luxembourg and
// Switzerland. Terms and rules: docs/operations/translation-glossary.md
export const france: Partial<Dictionary> = {
  "code.incorrect_information": "informations inexactes",
  "code.spam": "spam",
  "code.vegan": "végan",
  "account.intro":
    "Votre identifiant et votre nom d’affichage sont publics. Votre e-mail et l’historique détaillé de vos évaluations restent privés.",
  "addProduct.cannotAccept": "Cette proposition ne peut pas être acceptée.",
  "addProduct.confirmNoPhoto":
    "Avec une photo des ingrédients ou des valeurs nutritionnelles, un autre membre peut confirmer les données; sinon, la modération les vérifie.",
  "addProduct.foodPlaceholder": "Nuggets de poulet, cheddar, lait…",
  "addProduct.notInCountry": "Pas encore disponible · {country}",
  "addProduct.originalSubmission": "proposition initiale",
  "addProduct.photoRules":
    "JPEG, PNG ou WebP, jusqu’à 10 Mo chacune. Les photos restent privées jusqu’à la publication du produit.",
  "addProduct.progressUploading": "Envoi de la photo {number} sur {total}…",
  "addProduct.ratingSavedClear":
    "{meaning}. Enregistrée comme votre évaluation à la publication du produit; appuyez de nouveau pour l’effacer.",
  "addProduct.viewSubmission": "Voir votre proposition",
  "aisle.noRanked": "Aucune alternative classée pour l’instant.",
  "aisle.summary": "{foods} · {swaps} · les 3 premières pour chacun",
  "allergen.citeHint":
    "Si vous citez la photo des ingrédients ou des valeurs nutritionnelles de cette formule, d’autres contributeurs peuvent confirmer la déclaration. Sinon, l’équipe l’examine.",
  "allergen.none": "Aucun allergène à déclaration obligatoire sur l’étiquette",
  "allergen.photoNutrition": "La photo des valeurs nutritionnelles",
  "brand.metaDescription":
    "Tous les produits végans {name} · {country}, par aliment, avec le rang de chaque recette.",
  "brand.metaTitle": "Produits végans {name} · {country}",
  "category.aisleMetaDescription":
    "Tous les aliments de la catégorie {aisle} avec leurs alternatives véganes les plus proches, classées par des personnes qui les ont essayées.",
  "category.aisleMetaTitle":
    "Catégorie {aisle} · Alternatives véganes par aliment",
  "category.fewAnswers":
    "Ces alternatives ont moins de 5 réponses sur « {detail} », donc elles suivent le classement.",
  "category.flagTastiest": "Le plus savoureux n° 1",
  "category.flagTop": "Alternative n° 1",
  "category.how1":
    "Les personnes qui ont essayé un produit évaluent, de 1 à 5, sa ressemblance avec « {food} » à la même saveur. La recette d’une marque et ses saveurs sont classées ensemble : chaque personne compte une seule fois, selon la moyenne des saveurs qu’elle a évaluées, ajustée en fonction du nombre de personnes ayant évalué le produit. Les alternatives évaluées par moins de 10 personnes portent le badge « Préliminaire ». Le plus savoureux classe les réponses à « Dans quelle mesure est-il savoureux? » de la même façon et ne modifie jamais Le plus proche de l’original.",
  "category.knowSwap":
    "Vous connaissez une alternative à « {food} » qui n’est pas ici?",
  "category.metaDescription":
    "Comparez les alternatives véganes à « {food} », classées par similarité, avec le nombre d’évaluations et le détail des formules.",
  "category.metaTitle": "Les meilleures alternatives véganes à « {food} »",
  "category.noMatchFilters":
    "Aucune alternative classée ne correspond encore à vos filtres",
  "category.noNew": "Aucune nouvelle alternative récemment",
  "category.noTastyYet":
    "Personne n’a encore dit à quel point ces alternatives sont savoureuses, donc elles suivent Le plus proche de l’original.",
  "category.noneRanked": "Aucune alternative à « {food} » n’est encore classée",
  "category.notHere": "Pas encore disponible · {country}",
  "category.notHereBody":
    "Vous connaissez une alternative végane à « {food} » vendue ici? Ajoutez-la et « {food} » sera disponible dans ce pays ({country}).",
  "category.title": "Alternatives véganes à « {food} »",
  "category.topAlternatives": "Meilleures alternatives véganes à « {food} »",
  "category.trendingNote":
    "Tendance reflète les personnes qui évaluent, essaient et commentent une alternative au cours des trois derniers mois, par rapport aux trois mois précédents. Elle ne modifie jamais un classement.",
  "category.unratedNote":
    "Celles-ci n’ont aucune évaluation, donc elles ne sont pas classées. Vous en avez essayé une?",
  "comingSoon.footer":
    "Alternatives véganes classées par la communauté. Un site conçu pour votre prochaine bonne alternative.",
  "comingSoon.lead":
    "L’alternative au burger vraiment réussie. L’alternative au fromage qui fond vraiment. Trouvez des alternatives aux aliments que vous aimez, classées par des personnes qui les ont essayées.",
  "comingSoon.step1Body":
    "Commencez par ce que vous voulez remplacer. Découvrez les alternatives disponibles dans votre pays.",
  "comingSoon.title": "Trouvez l’alternative végane la plus proche.",
  "community.evidenceHint":
    "Indiquez un lien direct vers les informations pertinentes du fabricant ou de la certification.",
  "community.manufacturerVegan": "Étiqueté végan",
  "community.slotNutrition": "Photo des valeurs nutritionnelles",
  "contribute.canonicalRetailer": "Enseigne de référence",
  "contribute.chooseRetailer": "Choisir une enseigne",
  "contribute.findRetailer": "Trouver une enseigne",
  "contribute.formulaPlaceholder": "par ex. recette 2026",
  "contribute.kindRetailerStatus":
    "Problème de disponibilité chez une enseigne",
  "contribute.nutritionAllergensPhoto":
    "Photo des valeurs nutritionnelles et des allergènes",
  "contribute.photoLimits":
    "Jusqu’à 10 Mo par photo. Tant qu’une proposition est ouverte à la confirmation de la communauté, les contributeurs connectés peuvent voir ses preuves; sinon, elles restent privées pendant l’examen.",
  "contribute.productInfo": "Informations sur le produit",
  "contribute.proposeRetailer": "Proposer une enseigne",
  "contribute.retailerCheck":
    "Un membre de l’équipe vérifie son identité et son pays avant qu’elle puisse être sélectionnée.",
  "contribute.retailerName": "Nom de l’enseigne",
  "contribute.retailerSite": "Site web officiel de l’enseigne",
  "contribute.retailerWhy":
    "Pourquoi cette enseigne devrait-elle être ajoutée?",
  "contribute.selectRetailer": "Sélectionner une enseigne",
  "contribute.submitRetailer": "Soumettre la proposition d’enseigne",
  "contribute.tabRetailer": "Disponibilité chez les enseignes",
  "count.rankedSwap": {
    one: "{number} alternative classée",
    other: "{number} alternatives classées",
  },
  "count.swap": { one: "{number} alternative", other: "{number} alternatives" },
  "detail.followUpLink": "proposition d’origine et de ses preuves",
  "detail.receiptReady":
    "L’accusé de réception de la proposition est prêt. Ajoutez-y les photos et terminez l’examen final depuis la page de la proposition.",
  "detail.retailer": "Enseigne :",
  "detail.retailerEvidence": "Preuves actuelles de l’enseigne",
  "filters.commonlyAt": "Se trouve couramment chez :",
  "filters.noStores":
    "Aucun magasin n’a encore été signalé pour ces alternatives dans ce pays.",
  "filters.ofMatch": {
    one: "sur {number} alternative classée",
    other: "sur {number} alternatives classées",
  },
  "filters.pickStores":
    "Choisissez tous les magasins où vous faites vos courses",
  "filters.rankedSwapWord": {
    one: "alternative classée",
    other: "alternatives classées",
  },
  "filters.storeLabel": "Se trouve couramment chez : {summary}",
  "filters.storeLabelSelected":
    "Se trouve couramment chez : {summary}. Magasins sélectionnés : {names}",
  "filters.storeLine": "Se trouve couramment chez {names}",
  "filters.storesNote":
    "Se trouve couramment dans l’un de vos magasins choisis, selon les membres de ce pays ({country}). Vos choix sont enregistrés sur cet appareil pour tous les classements de ce pays.",
  "filters.storesPanel": "Magasins où vous faites vos courses",
  "footer.contact": "Nous contacter",
  "footer.tagline":
    "Alternatives véganes classées par la communauté · {country}",
  "footer.veganStatus": "Statut végan",
  "group.saucesDips": "Sauces, dips et pâtes à tartiner",
  "home.closestSwap": "Chaque aliment affiche son alternative la plus proche.",
  "home.eyebrow":
    "{foods} · {products} produits végans, évalués par des personnes qui les ont essayés",
  "home.heroLede":
    "Cherchez un aliment que vous achetez déjà. Vous verrez les produits végans que les gens trouvent les plus proches, classés.",
  "home.metaDescription":
    "Cherchez un aliment que vous achetez déjà et voyez les produits végans que les gens trouvent les plus proches, classés.",
  "home.metaTitle": "Trouvez l’alternative végane la plus proche",
  "home.metaTitleIn": "Trouvez l’alternative végane la plus proche · {country}",
  "home.noRankingsBody":
    "Les classements de ce pays ({name}) viennent des gens qui y vivent. Ajoutez un produit végan que vous achetez, ou proposez un aliment qu’il remplace, et il aura son propre classement dès que des gens l’auront évalué.",
  "home.seeAllSwaps": {
    one: "Voir {number} alternative à « {food} »",
    other: "Voir les {number} alternatives à « {food} »",
  },
  "home.topSwapsFor": "Meilleures alternatives pour",
  "home.topSwapsForName": "Meilleures alternatives pour {name}",
  "home.waitingTitle": "En attente d’une bonne alternative",
  "myContributions.opSubmission": "Proposition de produit",
  "myContributions.revisedLink": "proposition révisée",
  "myRatings.emptyBody":
    "Explorez un aliment, essayez une alternative et dites à quel point elle s’en rapproche.",
  "photo.back": "Arrière",
  "photo.front": "Avant",
  "photo.nutrition": "Valeurs nutritionnelles et allergènes",
  "photoProposal.moderatorReview":
    "Le remplacement d’une photo des ingrédients ou des valeurs nutritionnelles est examiné par un modérateur.",
  "photoProposal.uploading": "Envoi…",
  "product.addRetailer": "Vu ailleurs? Ajoutez ou confirmez une enseigne",
  "product.alsoRankedLine": "n° {rank} sur {of} · {people}",
  "product.classificationProvisional":
    "Provisoire : les preuves importées et les mentions de l’emballage ne suffisent pas, à elles seules, à établir une vérification.",
  "product.compareAll": "Comparer les {total} alternatives à « {food} »",
  "product.firstSwap": "Alternative n° 1 pour « {food} »",
  "product.labelNeither":
    "N’indique ni « végan », ni « végétal », ni « à base de plantes »",
  "product.labelVegan": "Indique « végan »",
  "product.noRetailers": "Aucune confirmation d’enseigne pour l’instant.",
  "product.otherSwaps": "Autres alternatives à « {food} »",
  "product.rankOfFor": "n° {rank} sur {of} pour « {food} »",
  "product.tapStores":
    "Appuyez sur chaque magasin où vous faites vos courses pour l’enregistrer sur cet appareil. Les classements montreront ce que vous pouvez trouver dans l’un d’eux.",
  "product.thisAlternative": "cette alternative végane",
  "ranking.overall": "n° {rank} au classement général",
  "rating.help":
    "Répondez à l’une des questions ou aux deux. Chaque choix s’enregistre aussitôt; appuyez de nouveau dessus pour l’effacer. Votre évaluation indique que vous avez essayé cette formule.",
  "rating.taste2": "Correct",
  "safety.optVegan": "Végan — vérification par l’équipe requise",
  "safety.veganStatus": "Statut végan",
  "saved.emptyBody":
    "Appuyez sur le signet sur la page d’un produit pour le garder ici.",
  "saved.find": "Trouver une alternative",
  "search.closestRank": "Le plus proche n° {rank} pour « {food} »",
  "search.groupFoods": "Aliments · alternative la plus proche affichée",
  "search.noRanked": "Aucune alternative classée pour l’instant",
  "search.submit": "Trouver des alternatives",
  "searchPage.metaDescription":
    "Explorez les alternatives véganes par aliment, marque ou produit. Parcourez le catalogue du pays : {country}.",
  "signIn.intro":
    "Gardez la trace de ce que vous avez essayé et aidez les autres à trouver une alternative plus proche. Si vous venez de choisir une note ou d’enregistrer un produit, nous conserverons votre choix à votre retour.",
  "signIn.unavailable":
    "Cette option de connexion n’est pas encore disponible.",
  "status.vegan": "Végan",
  "suggestFood.intro":
    "Un aliment est le produit conventionnel que les gens veulent remplacer, comme « Feuilletés à la saucisse » ou « Fromage à tartiner ». Il a son propre classement. Il est d’abord disponible dans ce pays ({country}); les autres pays l’obtiennent quand quelqu’un y ajoute un produit.",
  "summary.empty":
    "Aucune alternative végane à « {food} » n’est encore classée. Vous en avez essayé une? Votre évaluation lancera le classement.",
  "summary.emptyTastiest":
    "Personne n’a encore dit à quel point ces alternatives à « {food} » sont savoureuses. Vous en avez essayé une? Votre réponse lancera le classement.",
  "summary.manyPeople": "{number} personnes qui les ont essayées",
  "summary.onePerson": "1 personne qui l’a essayée",
  "summary.ranked": {
    one: "{number} alternative végane à « {food} » classée par {people}.",
    other: "{number} alternatives véganes à « {food} » classées par {people}.",
  },
  "rating.lastAteQuestion":
    "Quand avez-vous consommé « {food} » pour la dernière fois?",
  "product.recentEaters":
    "Les personnes qui ont consommé « {food} » au cours des 12 derniers mois donnent à cette saveur",
  "rating.recencyNote":
    "Montre à quel point il semble proche pour les gens qui en consomment encore. Cela ne change jamais le poids de votre évaluation.",
  "comments.intro":
    "Dites ce qu’il vaut par rapport à l’original : goût, texture, cuisson et la dernière fois que vous avez goûté l’original. Votez selon que le commentaire aide à comprendre le produit, et non selon que vous êtes d’accord avec lui.",
  "category.rateBelow":
    "Évaluez-en une ci-dessous ou ajoutez un produit que vous avez essayé.",
  "comingSoon.step2Body":
    "Classées selon leur ressemblance avec l’original; plus il y a d’avis, plus l’image est nette.",
  "aisle.knowAnother": "Vous en connaissez une autre?",
  "aisle.addIt": "Ajoutez-la.",
  "category.longTerm":
    "Le plus proche de l’original affiche le classement à long terme.",
  "comingSoon.burgers": "Burgers",
  "product.effective": "en vigueur : {date} (précision : {precision})",
  "code.ingredient_concern": "doute sur un ingrédient",
  "safety.optUnderReview": "En cours d’examen — doute sur un ingrédient",
  "product.underReview":
    "Un membre de l’équipe examine un doute sur un ingrédient. Cette formule est exclue des classements actifs et des nouvelles évaluations jusqu’à ce que ce doute soit levé.",
  "contribute.reportNote":
    "Les doutes sur un ingrédient sont traités en priorité. Un signalement ne modifie pas les faits du produit tant qu’un membre de l’équipe ne l’a pas examiné. Les signalements répétés mettent à jour vos preuves et ne comptent qu’une fois.",
  "community.errNetwork":
    "Vérifiez votre connexion et réessayez. Vos saisies sont conservées.",
  "community.errRate":
    "Trop de requêtes. Attendez une minute, puis réessayez. Vos saisies sont conservées.",
  "community.errServer":
    "Le serveur n’a pas pu traiter cette demande. Veuillez réessayer. Vos saisies sont conservées.",
  "community.errSession":
    "Votre session a expiré. Reconnectez-vous, puis réessayez. Vos saisies sont conservées.",
  "addProduct.notSavedUntil":
    "Vos nouvelles saisies ne sont pas enregistrées tant que vous ne choisissez pas « En commencer un nouveau ».",
  "contribute.noticePackaging":
    "Un simple changement d’emballage conserve la même formule et les mêmes évaluations. Joignez une photo du nouvel emballage.",
  "contribute.noticeDiscontinue":
    "Une fois l’arrêt accepté, le produit n’apparaît plus dans les découvertes ni dans les classements. Le produit et l’historique de sa formule restent consultables.",
  "code.online_only": "uniquement en ligne",
  "detail.eligibilityTitle": "Éligibilité proposée au classement",
  "detail.eligible": "Éligible",
  "detail.eligibleRanking": "Éligible au classement",
  "signIn.eyebrow": "Votre expérience fait la différence",
  "contribute.eyebrow": "Aidez à garder le catalogue utile",
  "allergen.onFile": "Actuellement enregistré :",
  "detail.allergensOnFile": "Allergènes enregistrés",
  "footer.guidelines": "Règles de la communauté",
  "community.guidelinesLink": "règles de la communauté",
  "signIn.termsLink": "conditions d’utilisation et les règles de la communauté",
  "signIn.privacyLink": "politique de confidentialité",
  "product.labelPlantBased": "Indique « végétal » ou « à base de plantes »",
  "community.manufacturerPlantBased": "Étiqueté végétal ou à base de plantes",
  "product.foundAt": "Se trouve couramment chez",
  "product.yours": "votre magasin",
  "comments.hideExplain":
    "Masquer ce commentaire au public? Son texte et ses votes sont conservés, et vous pouvez le rétablir depuis l’historique des décisions du produit.",
  "comments.hidden": "Commentaire masqué au public.",
  "home.pointAt":
    "Survolez un autre aliment de la liste pour en voir un aperçu.",
  "contribute.stanceNote":
    "Seule la position la plus récente de chaque personne est conservée. Confirmer de nouveau actualise sa date, mais n’augmente pas le poids de votre avis. Un membre de l’équipe décide s’il faut retirer un lien.",
  "account.handleHint":
    "De 3 à 30 lettres, chiffres ou tirets bas. Commencez par une lettre.",
  "safety.indiaMark":
    "Le symbole végétarien vert de l’Inde n’est pas une mention végane, car un aliment végétarien peut contenir des produits laitiers. Choisissez « Étiqueté végan » seulement si l’emballage indique « végan » ou porte le logo végan.",
  "nav.suggestFood": "Suggérer un aliment",
};
