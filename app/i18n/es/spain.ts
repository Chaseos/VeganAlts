import type { Dictionary } from "..";

// Spain's differences from the shared dictionary; anything else falls through.
// Terms and rules: docs/operations/translation-glossary.md
export const spain: Partial<Dictionary> = {
  "account.handleHint":
    "De 3 a 30 letras, números o guiones bajos. Empieza por una letra.",
  "account.intro":
    "El nombre de usuario y el nombre para mostrar que elijas son públicos. Tu correo electrónico y tu historial de valoraciones individuales siguen siendo privados.",
  "account.myRatings": "Mis valoraciones",
  "account.signOutFailed":
    "No se ha podido cerrar la sesión. Inténtalo de nuevo.",
  "addProduct.acceptedRated":
    "Cuando se acepte, se publicará en este país ({country}) y se guardará tu valoración.",
  "addProduct.addAnother": "Añadir otro producto",
  "addProduct.addAnyway": "Añadirlo de todos modos",
  "addProduct.addNewBrand": "Añadir “{name}” como marca nueva",
  "addProduct.added": "Añadido",
  "addProduct.addedNothingAnimal": "Añadido · nada de origen animal",
  "addProduct.addingTo": "Añadiendo a",
  "addProduct.allOptional":
    "Todo lo de aquí es opcional. Envíalo ahora o añade lo que sepas.",
  "addProduct.allergensAdded": {
    one: "{number} alérgeno añadido",
    other: "{number} alérgenos añadidos",
  },
  "addProduct.alreadyListed":
    "{name} ya está en la lista, incluidos otros tamaños de envase.",
  "addProduct.brandsFailed": "No hemos podido revisar las marcas.",
  "addProduct.brandsFailedRetry":
    "No hemos podido revisar las marcas. Inténtalo de nuevo.",
  "addProduct.bringsFood":
    "Al añadir un producto, “{food}” se habilitará en este país ({country}).",
  "addProduct.checkedNothing":
    "He revisado los ingredientes y no he encontrado nada de origen animal",
  "addProduct.confirmNoPhoto":
    "Con una foto de los ingredientes o de la información nutricional, otro miembro puede confirmarlo; si no, lo revisa un moderador.",
  "addProduct.duplicate":
    "Este producto ya está en VeganAlts. Mejor valóralo, o cambia el nombre si es otro sabor o fórmula.",
  "addProduct.duplicateShort":
    "Este producto ya está en VeganAlts. Mejor valóralo.",
  "addProduct.followBefore":
    "Puedes seguir su estado y responder a cualquier pregunta en",
  "addProduct.foundAtNote":
    "“Se encuentra comúnmente en”, no es disponibilidad en tiempo real. Hasta 10 tiendas.",
  "addProduct.foundIt":
    "¿Lo has encontrado aquí? Valóralo en lugar de añadirlo otra vez. Un sabor que no esté en la lista se une a su gama.",
  "addProduct.frontOfPack": "Foto de la parte frontal del envase",
  "addProduct.intro":
    "Primero cuéntanos lo básico. Todo lo demás es opcional y cualquiera puede añadirlo después.",
  "addProduct.linesElsewhere": {
    one: "{number} gama de {brand} en otros alimentos",
    other: "{number} gamas de {brand} en otros alimentos",
  },
  "addProduct.linesFailed":
    "No hemos podido revisar lo que hay de {brand} en la lista.",
  "addProduct.metaTitle": "Añadir un producto · VeganAlts",
  "addProduct.moreTitle": "Añade más (opcional)",
  "addProduct.nameHintFlavor":
    "Como lo nombra el envase. Los tamaños de envase comparten un solo producto.",
  "addProduct.nameHintNew":
    "Incluye el sabor. Los tamaños de envase comparten un solo producto.",
  "addProduct.newFlavorOf": "Añadir un sabor nuevo de {name}",
  "addProduct.noStores":
    "Todavía no hay tiendas en la lista para este país ({country}). Puedes añadir una desde la página del producto cuando esté publicado.",
  "addProduct.packageSays": "¿Qué dice el envase?",
  "addProduct.photosNotRestored":
    "No se han podido restaurar las fotos guardadas desde este dispositivo. Elígelas de nuevo antes de enviar.",
  "addProduct.rateIt": "Valóralo",
  "addProduct.ratingSaved":
    "Se guarda como tu valoración cuando se publique el producto.",
  "addProduct.ratingSavedClear":
    "{meaning}. Se guarda como tu valoración cuando se publique el producto; púlsala otra vez para quitarla.",
  "addProduct.recordPackage": "Anota lo que dice el envase.",
  "addProduct.savedOnDeviceGeneric":
    "Un producto que has empezado está guardado en este dispositivo.",
  "addProduct.step2": "2. Añade más (opcional)",
  "addProduct.tasty": "¿Cómo de sabroso es, se parezca o no al original?",
  "addProduct.thatsIt": "Es este, valorarlo",
  "addProduct.thisLine": "esta gama",
  "addProduct.title": "Añadir un producto",
  "addProduct.triedIt": "¿Lo has probado? ¿Cuánto se parece a “{food}”?",
  "addProduct.updateDetails":
    "Actualiza los datos y añade las fotos que quieras que se revisen de nuevo. Tu",
  "addProduct.whatNext": "Qué pasa ahora",
  "aisle.addIt": "Añádela.",
  "aisle.anyoneCanSuggest":
    "Cualquiera puede sugerir uno. Tendrá su propia clasificación cuando las personas añadan y valoren productos.",
  "allergen.checkPackage": "Revisa siempre el envase.",
  "allergen.citeHint":
    "Si citas los ingredientes de la fórmula o la foto de la información nutricional, otros colaboradores pueden confirmar la declaración. Si no, la revisa el equipo.",
  "allergen.fromLabels":
    "Los alérgenos provienen de las etiquetas del envase y pueden cambiar con la receta.",
  "allergen.photoNutrition": "La foto de la información nutricional",
  "allergen.record":
    "Anota lo que dice el envase de esta fórmula. Las confirmaciones verifican que la declaración coincida con la etiqueta, nunca que un producto sea seguro.",
  "appearance.current": "Aspecto: {theme}",
  "appearance.label": "Aspecto",
  "brand.addFrom": "Añadir un producto de {name}",
  "brand.foundOne":
    "¿Has encontrado uno aquí? Añádelo y entrará en las clasificaciones.",
  "brand.notRated": "Sin valorar todavía",
  "brandChange.line": "Gama",
  "brandChange.newLine": "Una gama nueva",
  "brandChange.newLineName": "Nombre de la gama nueva",
  "brandChange.note":
    "El producto conserva su dirección, sus fotos y sus valoraciones. Una gama pertenece a una sola marca, así que pasa a una gama de la marca nueva.",
  "category.allergenSource":
    "Los alérgenos provienen de las etiquetas del envase, y los miembros los confirman con la foto de la etiqueta.",
  "category.flagTastiest": "Más sabroso n.º 1",
  "category.flagTop": "Alternativa n.º 1",
  "category.how1":
    "Las personas que han probado un producto valoran, de 1 a 5, lo parecido que es a “{food}” en el mismo sabor. La receta de una marca y sus sabores se clasifican juntos: cada persona cuenta una sola vez, con la media de los sabores que ha valorado, ajustada según cuántas personas lo han valorado. Las alternativas valoradas por menos de 10 personas muestran la insignia Preliminar. Más sabroso clasifica de la misma forma las respuestas a “¿Cómo de sabroso es?” y nunca modifica Más parecido al original.",
  "category.howDetails":
    "{list} son valoraciones de detalle opcionales que explican la puntuación.",
  "category.metaDescription":
    "Compara alternativas veganas para “{food}”, clasificadas por parecido, con el número de valoraciones y los detalles de la fórmula.",
  "category.newNote":
    "Añadidos en los últimos {days} días. Ser nuevo nunca sube una puntuación.",
  "category.newWaiting":
    "Un producto nuevo quizá siga esperando su primera valoración. Revisa abajo o amplía tus filtros.",
  "category.noTastyYet":
    "Nadie ha dicho todavía lo sabrosas que son, así que se ordenan según Más parecido al original.",
  "category.notHereBody":
    "¿Conoces una alternativa vegana para “{food}” que se venda aquí? Añádela y “{food}” se habilitará en este país ({country}).",
  "category.nothingTrending": "Por ahora no hay nada en tendencia",
  "category.rateBelow":
    "Valora una abajo o añade un producto que hayas probado.",
  "category.report": "Informar de un problema con este alimento",
  "category.sortMost": "Más valorados",
  "category.sortNewHint": "Añadidos hace poco",
  "category.trendingNote":
    "Tendencia refleja a las personas que valoran, prueban y comentan una alternativa durante los últimos tres meses, en comparación con los tres meses anteriores. Nunca modifica una clasificación.",
  "category.unratedNote":
    "Estas no tienen valoraciones, así que no están clasificadas. ¿Ya has probado alguna?",
  "category.wrong": "¿Hay algún error aquí?",
  "check.failed": "La verificación ha fallado. Inténtalo de nuevo.",
  "check.loadFailed": "No se ha podido cargar la verificación de seguridad.",
  "check.loadRetry":
    "No se ha podido cargar la verificación de seguridad. Inténtalo de nuevo.",
  "code.appears_plant_based": "parece ser de origen vegetal",
  "code.discontinued": "descatalogado",
  "code.expired": "caducado",
  "code.plant_based": "de origen vegetal",
  "comingSoon.noteLead": "Una forma mejor de encontrar tu próximo favorito.",
  "comingSoon.step2Body":
    "Clasificadas según lo parecidas que son al original, y con más opiniones el panorama es más claro.",
  "comments.add": "Añade tu experiencia",
  "comments.collapsed": "Se ha contraído por muchos votos de “no útil”.",
  "comments.deleted": "Tu comentario se ha eliminado.",
  "comments.loadFailed":
    "No se han podido cargar los comentarios. Inténtalo de nuevo.",
  "comments.posted": "Tu comentario se ha publicado.",
  "comments.report": "Denunciar",
  "comments.reportReceived": "Denuncia recibida",
  "comments.sendReport": "Enviar denuncia",
  "comments.title": "Notas de quienes lo han probado",
  "comments.updated": "Tu comentario se ha actualizado.",
  "comments.wasUseful": "¿Te ha resultado útil este comentario?",
  "comments.whyReport": "¿Por qué lo denuncias?",
  "community.errCheck":
    "No se ha podido terminar la revisión. Inténtalo de nuevo.",
  "community.errSave":
    "No se ha podido guardar la solicitud. Inténtalo de nuevo.",
  "community.errServer":
    "El servidor no ha podido completar esta solicitud. Inténtalo de nuevo. Tus datos siguen aquí.",
  "community.errSession":
    "Tu sesión ha caducado. Inicia sesión otra vez e inténtalo de nuevo. Tus datos siguen aquí.",
  "community.manufacturerPlantBased": "Etiquetado como de origen vegetal",
  "community.noScript":
    "Se requiere JavaScript para añadir o editar contribuciones. Actívalo y recarga la página para continuar.",
  "community.reasonWrongLine": "No es de esta gama",
  "community.signInAgainAfter": ", luego vuelve aquí e inténtalo de nuevo.",
  "community.slotBack": "Foto trasera",
  "community.slotFront": "Foto frontal",
  "community.slotNutrition": "Foto de la información nutricional",
  "contribute.addOneFirst": "Añade una primero",
  "contribute.foundAtIntro":
    "Comparte dónde se vende comúnmente este producto en este país ({country}). Esto no indica disponibilidad en tiempo real.",
  "contribute.intro":
    "Tu evidencia ayuda al equipo a tomar una decisión informada. Las valoraciones existentes se quedan con su fórmula original.",
  "contribute.introAdmin":
    "Tus ediciones se aplican de inmediato. Las valoraciones existentes se quedan con su fórmula original.",
  "contribute.itsLineNow": "{name} (ahora su gama)",
  "contribute.kindDiscontinue": "Producto descatalogado",
  "contribute.kindPackaging": "Actualización del envase",
  "contribute.kindReintroduce": "Producto que ha vuelto al mercado",
  "contribute.kindRelationships":
    "Gama, productos relacionados y para qué alimentos se clasifica",
  "contribute.lineNote":
    "Los sabores de una misma receta base comparten una gama y una clasificación. El equipo revisa el cambio a otra gama.",
  "contribute.noticeDiscontinue":
    "Si se acepta la descatalogación, el producto deja de aparecer en la búsqueda y de poder clasificarse. El producto y el historial de su fórmula siguen visibles.",
  "contribute.noticePackaging":
    "Los cambios que solo afectan al envase conservan la misma fórmula y las valoraciones. Adjunta una foto del envase actualizado.",
  "contribute.noticeReformulation":
    "Un cambio importante en los ingredientes o la fórmula inicia una nueva fórmula vigente. Las valoraciones, comentarios y evidencia anteriores quedan en el historial.",
  "contribute.nutritionAllergensPhoto":
    "Foto de la información nutricional y los alérgenos",
  "contribute.photoChecked": "La foto que has revisado",
  "contribute.rankedNote":
    "No incluyas un sabor en los alimentos donde clasificarlo sería engañoso. Las valoraciones existentes se conservan.",
  "contribute.recipeLine": "Gama de receta",
  "contribute.reportNote":
    "Las dudas sobre ingredientes tienen prioridad. Un aviso no cambia los datos del producto hasta que el equipo lo evalúe. Los avisos repetidos actualizan tu evidencia y cuentan una sola vez.",
  "contribute.reportTarget": "¿Sobre qué quieres informar?",
  "contribute.reportTitle": "Informar de un problema con este producto",
  "contribute.reportedPhotoAlt": "Foto sobre la que se informa",
  "contribute.retailerWhy": "¿Por qué debería añadirse esta tienda?",
  "contribute.submitReport": "Enviar aviso",
  "contribute.tabReport": "Informar de un problema",
  "contribute.whatChanged": "¿Qué ha cambiado?",
  "count.rating": {
    one: "{number} valoración",
    other: "{number} valoraciones",
  },
  "country.note":
    "Las clasificaciones de cada país vienen de las personas que viven allí. Los países sin datos esperan los primeros productos.",
  "detail.joinsLine": "Se une a la gama:",
  "detail.keepsLine": "Conserva su gama",
  "detail.line": "Gama:",
  "detail.receiptReady":
    "El justificante del envío está listo. Completa sus fotos y la revisión final desde la página del envío.",
  "detail.reportedComment": "Comentario denunciado",
  "detail.reportedConcern": "Problema notificado",
  "draft.addFront": "Añade una foto del frente del envase.",
  "draft.chooseBrand":
    "Elige la marca de la lista, o añádela como marca nueva.",
  "draft.chooseLine":
    "Elige el producto si aparece en la lista, un sabor nuevo de una gama, u otro producto de la marca.",
  "error.failedTitle": "Algo ha salido mal.",
  "fact.flavorHint":
    "Déjalo en blanco para la versión original o natural de la gama. El producto conserva su dirección y sus valoraciones. Adjunta una foto del frente donde se vea el nuevo nombre.",
  "fact.moveNote":
    "Al moverlo se desmarcan sus alimentos actuales; marca uno de nuevo para que aparezca en ambos. Las valoraciones nunca se pierden: un alimento ya valorado las conserva, fuera de su clasificación, y el producto empieza sin valorar en un alimento nuevo.",
  "fact.nameLabel": "Nombre como aparece impreso en el envase",
  "fact.rename": "Nombre del producto en el envase",
  "fact.separateRatings":
    "Las valoraciones de cada alimento son independientes. El producto empieza sin valorar allí.",
  "filters.freeNote":
    "Solo cuentan las etiquetas confirmadas. Un “puede contener” en la etiqueta también excluye el producto. Revisa siempre el envase. Tus elecciones se guardan en este dispositivo para todas las clasificaciones de este país.",
  "filters.noStores":
    "Aún no se han indicado tiendas para estas alternativas en este país.",
  "filters.storesNote":
    "Se encuentra comúnmente en cualquiera de las tiendas que has elegido, según lo indicado por miembros en este país ({country}). Tus elecciones se guardan en este dispositivo para todas las clasificaciones de este país.",
  "footer.reportTranslation": "Informar de un problema de traducción",
  "group.saucesDips": "Salsas, dips y cremas para untar",
  "home.addFirst": "Añade el primer producto",
  "home.eyebrow":
    "{foods} · {products} productos veganos, valorados por personas que los han probado",
  "home.firstToAdd": "Sé la primera persona en añadir uno",
  "home.newMeta": "Para “{food}” · añadido el {date}",
  "home.newNote": "Añadidos en los últimos {days} días",
  "home.newTitle": "Nuevos y en espera de valoraciones",
  "home.noRankingsBody":
    "Las clasificaciones de este país ({name}) vienen de personas que viven allí. Añade un producto vegano que compres, o sugiere un alimento al que reemplaza, y tendrá su propia clasificación cuando las personas lo valoren.",
  "home.openFood":
    "Abre un alimento para añadir el primer producto que las personas puedan valorar aquí.",
  "home.pointAt":
    "Pasa el ratón sobre otro alimento de la lista para ver su vista previa.",
  "home.startTitle": "¿Primera vez? Empieza por estas",
  "home.waitingBody":
    "La mejor opción para estos alimentos tiene menos de 3,5, o todavía no hay ninguna clasificada. ¿Conoces una mejor? Añádela y entrará en la clasificación.",
  "menu.addProduct": "Añade un producto",
  "menu.myRatings": "Mis valoraciones",
  "myContributions.emptyAdd": "Añadir un producto →",
  "myContributions.replacedBefore": "Este registro ha sido reemplazado por tu",
  "myRatings.archived": "Duplicado archivado · Tu valoración se conserva aquí",
  "myRatings.edit": "Editar valoración",
  "myRatings.emptyBody":
    "Explora un alimento, prueba una alternativa y cuenta cuánto se parece.",
  "myRatings.historical": "Valoración anterior",
  "myRatings.metaTitle": "Mis valoraciones · VeganAlts",
  "myRatings.older": "Valoraciones anteriores",
  "myRatings.pages": "Páginas de mis valoraciones",
  "myRatings.title": "Mis valoraciones",
  "pending.label": "Tu valoración pendiente",
  "pending.retry": "Reintentar la valoración elegida",
  "pending.unsaved": "La valoración que has elegido no se ha guardado.",
  "personal.badResponse":
    "El servicio no ha respondido correctamente. Inténtalo de nuevo.",
  "personal.connectionLost": "Se ha perdido la conexión. Inténtalo de nuevo.",
  "personal.connectionLostSelection":
    "Se ha perdido la conexión. Tu selección sigue aquí; reintenta cuando quieras.",
  "personal.loadFailed":
    "No se ha podido cargar tu información personal. Inténtalo de nuevo.",
  "personal.loadFailedShort": "No se ha podido cargar la información personal.",
  "personal.notSaved": "Tu valoración no se ha guardado. Inténtalo de nuevo.",
  "personal.storage":
    "Tu navegador no ha podido recordar esta selección. Activa el almacenamiento de la pestaña e inténtalo de nuevo.",
  "personal.unconfirmed":
    "No se ha podido confirmar la valoración guardada. Inténtalo de nuevo.",
  "photo.add": "Añadir foto",
  "photo.back": "Trasera",
  "photo.front": "Frontal",
  "photo.nutrition": "Información nutricional y alérgenos",
  "photo.suggestBetter": "Sugerir una foto mejor",
  "photoAdmin.add": "Añadir",
  "photoAdmin.addLabel": "Añadir la foto: {slot}",
  "photoAdmin.added": "Foto añadida: {slot}.",
  "photoAdmin.manage": "Gestionar fotos",
  "photoAdmin.notSaved": "La foto no se ha guardado",
  "photoAdmin.saveFailed": "No se ha podido guardar la foto.",
  "photoProposal.add": "Añadir una foto",
  "photoProposal.moderatorReview":
    "Un moderador revisa el reemplazo de una foto de ingredientes o de información nutricional.",
  "photoProposal.outdated": "El envase ha cambiado",
  "photoProposal.reformulation":
    "Si han cambiado los ingredientes, sugiere mejor una reformulación importante para que las valoraciones anteriores se queden con la fórmula anterior.",
  "photos.improve": "Añadir o mejorar fotos",
  "photos.loadFailed": "No se ha podido cargar esta foto.",
  "photos.package": "Fotos del envase",
  "preview.banner":
    "Vista previa de desarrollo · Catálogo de demostración y valoraciones de ejemplo",
  "product.addAllergens": "Añade los alérgenos",
  "product.addFlavor": "Añadir otro sabor",
  "product.addRetailer":
    "¿Lo has visto en otro sitio? Añade o confirma una tienda",
  "product.alsoRankedLine": "N.º {rank} de {of} · {people}",
  "product.availabilityNote":
    "Información aportada por la comunidad, no disponibilidad en tiempo real.",
  "product.breakdown": "Desglose de valoraciones",
  "product.classificationProvisional":
    "Provisional: la evidencia subida y el texto del envase, por sí solos, no establecen una verificación.",
  "product.closenessRatings": "Valoraciones de parecido con “{food}”",
  "product.communityRatings": "Valoraciones de la comunidad",
  "product.demoCatalog":
    "Catálogo de demostración. Los detalles de los productos, las ilustraciones y las valoraciones de ejemplo son datos ficticios de desarrollo, no afirmaciones verificadas de los fabricantes.",
  "product.detailFrom":
    "De {people} que han añadido valoraciones de detalle a este sabor.",
  "product.factsChecked":
    "Verificados por miembros con fotos del envase. ¿Has visto un error?",
  "product.firstSwap": "Alternativa n.º 1 para “{food}”",
  "product.historicalBody":
    "Estas valoraciones pertenecen a una fórmula anterior.",
  "product.historicalScores":
    "Las puntuaciones anteriores se conservan. Elige la fórmula actual para añadir tu experiencia.",
  "product.howRated": "Cómo lo ha valorado la gente",
  "product.keepRatings": "conservan sus propias valoraciones.",
  "product.labelNeither": "No dice “vegano” ni “de origen vegetal”",
  "product.labelPlantBased": "Dice “de origen vegetal”",
  "product.lifecycle":
    "Este producto está {status}. No se pueden añadir valoraciones nuevas.",
  "product.liveAddDetail": "Añade valoraciones de detalle",
  "product.liveJoins": "para que entre en la clasificación.",
  "product.livePending": "Tu valoración se guardará en un momento.",
  "product.liveRateIt": "Valóralo",
  "product.liveRated": "Tu valoración de {rating}/5 se ha guardado.",
  "product.liveThanks": "Gracias por añadirlo.",
  "product.liveTried": "¿Ya lo has probado?",
  "product.manage": "Gestionar producto",
  "product.noPackageList":
    "No había una lista de ingredientes legible en el envase.",
  "product.nobodyReported": "Todavía nadie ha indicado dónde se vende.",
  "product.ownRatings":
    "Cada producto y cada país tienen sus propias valoraciones.",
  "product.packageLabel": "Etiqueta del envase",
  "product.rankOfFor": "N.º {rank} de {of} para “{food}”",
  "product.ratings": "Valoraciones",
  "product.ratingsUnavailable":
    "Por ahora no hay valoraciones disponibles para este alimento.",
  "product.recentEaters":
    "Quienes han comido “{food}” en el último año le dan a este sabor",
  "product.report": "Informar de un problema",
  "product.supplementedFrom":
    "El texto del envase se ha complementado con {source}.",
  "product.tapStores":
    "Pulsa cada tienda donde compras para guardarlas en este dispositivo. Las clasificaciones mostrarán lo que puedes encontrar en cualquiera de ellas.",
  "product.tooFew": "Aún hay pocas valoraciones",
  "product.underReview":
    "El equipo está evaluando una duda sobre los ingredientes. Esta fórmula queda fuera de las clasificaciones activas y no recibe valoraciones nuevas hasta que se resuelva.",
  "product.unrated": "Sin valorar",
  "product.verifiedFromLabel": "{status}, según la etiqueta del envase.",
  "product.verifiedNoSource":
    "No había una lista de ingredientes legible en el envase ni una fuente de ingredientes en línea.",
  "product.verifiedOnline":
    "No hay una lista de ingredientes legible en el envase que coincida; se ha comparado con una fuente en línea del producto exacto.",
  "product.whereFound": "Dónde lo han encontrado los miembros",
  "product.yourRating": "Tu valoración",
  "ranking.added": "añadido el {date}",
  "ranking.firstToRate": "Sé la primera persona en valorar",
  "ranking.noRatings": "Sin valoraciones",
  "ranking.noRatingsYet": "Aún sin valoraciones",
  "ranking.noTasty": "Nadie ha dicho todavía lo sabroso que es",
  "ranking.overall": "N.º {rank} en general",
  "ranking.rateIt": "Valóralo",
  "ranking.rateLabel": "Valóralo: {name}",
  "ranking.rateLabelFlavor": "Valóralo: {name} · {flavor}",
  "ranking.triedIt": "Ya lo he probado",
  "rating.addDetail": "Añadir detalle",
  "rating.closeQuestion": "¿Lo has probado? ¿Cuánto se parece a “{food}”?",
  "rating.closeQuestionFlavored":
    "¿Lo has probado? ¿Cuánto se parece a “{food}” del mismo sabor?",
  "rating.conflict": "Esta fórmula o sus preguntas han cambiado.",
  "rating.detailLegend": "Valoraciones de detalle y última vez que lo comiste",
  "rating.help":
    "Responde una de las preguntas o ambas. Cada opción se guarda al instante; púlsala otra vez para quitarla. Tu valoración marca esta fórmula como probada.",
  "rating.loading": "Cargando tu valoración…",
  "rating.noscript":
    "Se necesita JavaScript para guardar una valoración. Actívalo y recarga la página para valorar este producto.",
  "rating.queueFailed": "Tu valoración no se ha guardado. Inténtalo de nuevo.",
  "rating.queueRemoved": "Valoración eliminada. Ya has probado esta fórmula.",
  "rating.queueSaved": "Se ha guardado {answer}. Ya has probado esta fórmula.",
  "rating.queueSavedDetails": {
    one: "Se ha guardado {answer} con {number} detalle. Ya has probado esta fórmula.",
    other:
      "Se ha guardado {answer} con {number} detalles. Ya has probado esta fórmula.",
  },
  "rating.rateAgain": "y valórala de nuevo.",
  "rating.rateAs": "Valóralo como “{food}”",
  "rating.recencyNote":
    "Muestra cuánto se parece según quienes todavía lo comen. Nunca cambia cuánto cuenta tu valoración.",
  "rating.removalTarget": "eliminación de la valoración",
  "rating.tastyQuestion": "¿Cómo de sabroso es, se parezca o no al original?",
  "rating.yours": "Tu valoración: {score}/5",
  "rating.yoursTaste": "Tu valoración de sabor: {taste}/5",
  "reportFood.metaTitle": "Informar de un problema con un alimento · VeganAlts",
  "reportFood.noteLabel": "¿Quieres añadir algo? (opcional)",
  "reportFood.send": "Enviar aviso",
  "reportFood.title": "Informar de un problema con un alimento",
  "reportTranslation.intro":
    "Cuéntanos qué textos están mal, no se entienden o suenan raros. Leemos todos los avisos.",
  "reportTranslation.metaTitle":
    "Informar de un problema de traducción · VeganAlts",
  "reportTranslation.send": "Enviar aviso",
  "reportTranslation.title": "Informar de un problema de traducción",
  "responses.addEvidence": "Añadir evidencia",
  "responses.confirmed": "Gracias. Se ha registrado tu confirmación.",
  "responses.evidenceAttached": "Gracias. Se ha adjuntado tu evidencia.",
  "responses.intro":
    "Confirma solo lo que hayas comprobado por tu cuenta, por ejemplo en el envase. Los cambios de bajo riesgo se aplican después de una confirmación independiente; los datos protegidos siempre pasan a un moderador.",
  "safety.addIngredientsPhoto": "Añade una foto de los ingredientes",
  "safety.checkPackage": "Revisa siempre el envase.",
  "safety.confirmedBy": "Confirmado por {members} según el envase.",
  "safety.indiaMark":
    "La marca verde vegetariana de India no es una etiqueta vegana, porque los alimentos vegetarianos pueden contener lácteos. Elige “Etiquetado como vegano” solo si el envase dice vegano o tiene el logotipo vegano.",
  "safety.optAppearsPlantBased": "Parece ser de origen vegetal",
  "safety.optPlantBased": "De origen vegetal",
  "safety.uncheckedChoose":
    "Ingredientes aún sin revisar. Elige la foto de los ingredientes que has revisado y lo que muestra. Otro miembro la confirma, y cualquier desacuerdo pasa a un moderador.",
  "safety.uncheckedHint":
    "Sin una foto de los ingredientes o un enlace, el producto muestra “Ingredientes aún sin revisar” hasta que alguien los añada. Las fotos se añaden en “Lo básico”.",
  "safety.uncheckedNoPhoto":
    "Quien añadió este producto no incluyó sus ingredientes. ¿Tienes el envase?",
  "save.removed": "Se ha quitado de tu lista.",
  "save.unchanged": "Tu lista de guardados no ha cambiado. Inténtalo de nuevo.",
  "saved.discontinued": "Descatalogado",
  "saved.emptyBody":
    "Pulsa el marcador en la página de un producto para conservarlo aquí.",
  "search.closestRank": "Más parecido n.º {rank} para “{food}”",
  "search.emptyBody":
    "Revisa la ortografía o sugiérelo como alimento nuevo para que otras personas añadan productos.",
  "search.loadFailed":
    "No se han podido cargar las sugerencias. Pulsa Intro para buscar.",
  "search.placeholder": "Carne picada, queso cheddar, huevos…",
  "search.unavailable":
    "Las sugerencias no están disponibles por ahora. Pulsa Intro para buscar.",
  "searchPage.checkSpelling":
    "Revisa la ortografía o prueba con un alimento más general, como ternera, queso o leche.",
  "seeMore.added": "Se han añadido {count} {what} más.",
  "seeMore.limit":
    "Has llegado al límite de exploración. Afina tu búsqueda o tus filtros para encontrar más.",
  "seeMore.loadFailed":
    "No se han podido cargar más resultados. Vuelve a intentarlo.",
  "seeMore.offline":
    "No se han podido cargar más resultados. Revisa tu conexión y vuelve a intentarlo.",
  "seeMore.unrated": "productos sin valorar",
  "select.searchFailed":
    "No se ha podido cargar la búsqueda. Edítala para volver a intentarlo.",
  "signIn.couldNotStart": "No se ha podido iniciar sesión. Inténtalo de nuevo.",
  "signIn.didNotFinish":
    "No se ha completado el inicio de sesión. Inténtalo de nuevo.",
  "signIn.eyebrow": "Tu experiencia marca la diferencia",
  "signIn.intro":
    "Lleva el registro de lo que has probado y ayuda a otros a encontrar una alternativa más parecida. Si acabas de elegir una puntuación o de guardar un producto, lo conservaremos cuando vuelvas.",
  "signIn.privacyLink": "política de privacidad",
  "signIn.termsAfter": ". Consulta cómo tratamos tus datos en la",
  "status.appearsPlantBased": "Parece ser de origen vegetal",
  "status.plantBased": "De origen vegetal",
  "suggestFood.intro":
    "Un alimento es el producto convencional que la gente quiere reemplazar, como “Rollos de salchicha” o “Queso crema”. Tiene su propia clasificación. Primero se abre en este país ({country}); los demás países lo reciben cuando alguien añade allí un producto.",
  "suggestFood.productLink": "Añádelo junto con el producto",
  "summary.empty":
    "Aún no hay alternativas veganas para “{food}” clasificadas. ¿Ya has probado alguna? Tu valoración inicia la clasificación.",
  "summary.emptyTastiest":
    "Nadie ha dicho todavía lo sabrosas que son estas alternativas para “{food}”. ¿Ya has probado alguna? Tu respuesta inicia la clasificación.",
  "summary.manyPeople": "{number} personas que ya han hecho la prueba",
  "summary.onePerson": "1 persona que ya ha hecho la prueba",
};

export const spainErrors: Record<string, string> = {
  "A category changed. Refresh before merging.":
    "Una categoría ha cambiado. Actualiza la página antes de fusionar.",
  "A moderator has hidden this comment, so it can't be edited.":
    "Un moderador ha ocultado este comentario, por lo que no se puede editar.",
  "A newer response replaced this check.":
    "Una respuesta más reciente ha reemplazado esta revisión.",
  "A previously featured category was retired. Choose new features instead.":
    "Una categoría destacada anteriormente se ha retirado. Elige otros destacados.",
  "A previously featured food is no longer on in this country. Switch it on there or choose new features.":
    "Un alimento destacado anteriormente ya no está activado en este país. Actívalo allí o elige otros destacados.",
  "Aisle not found.": "No se ha encontrado la categoría.",
  "Aisles take no aliases or search terms. Add them to a food.":
    "Las categorías no llevan alias ni términos de búsqueda. Añádelos a un alimento.",
  "Archived products cannot change lines.":
    "Los productos archivados no pueden cambiar de gama.",
  "Attach the updated packaging photos.":
    "Adjunta las fotos actualizadas del envase.",
  "Brand not found.": "No se ha encontrado la marca.",
  "Category not found.": "No se ha encontrado la categoría.",
  "Choose Closest match, Tastiest, Trending, Newest, Most rated or a detail sort.":
    "Elige Más parecido al original, Más sabroso, Tendencia, Más recientes, Más valorados o un orden por detalle.",
  "Choose a closeness answer before adding comparison details.":
    "Elige una respuesta de parecido antes de añadir detalles de comparación.",
  "Choose a line of this brand in this country.":
    "Elige una gama de esta marca en este país.",
  "Choose an image no larger than 10 MiB.":
    "Elige una imagen de 10 MiB como máximo.",
  "Choose an image with at most 40 megapixels.":
    "Elige una imagen de 40 megapíxeles como máximo.",
  "Choose one of the brand’s lines, or name a new one.":
    "Elige una de las gamas de la marca o escribe el nombre de una nueva.",
  "Cite this formula’s accepted ingredients or nutrition photo.":
    "Cita la foto de ingredientes o de información nutricional aceptada de esta fórmula.",
  "Comment not found.": "No se ha encontrado el comentario.",
  "Contribution not found.": "No se ha encontrado la contribución.",
  "Endpoint not found.": "No se ha encontrado el endpoint.",
  "Evidence not found.": "No se ha encontrado la evidencia.",
  "Formula not found.": "No se ha encontrado la fórmula.",
  "Homepage features changed since this action.":
    "Los destacados de la página de inicio han cambiado desde esta acción.",
  "Merge not found.": "No se ha encontrado la fusión.",
  "Nothing changed.": "No ha habido cambios.",
  "Only discontinued products can be reintroduced.":
    "Solo se pueden reintroducir productos descatalogados.",
  "Processing expired. Please retry with the same key.":
    "El procesamiento ha caducado. Vuelve a intentarlo con la misma clave.",
  "Processing expired. Please retry.":
    "El procesamiento ha caducado. Vuelve a intentarlo.",
  "Product not found.": "No se ha encontrado el producto.",
  "Product or formula not found.":
    "No se ha encontrado el producto o la fórmula.",
  "Product removal requires a report that the product does not belong on VeganAlts.":
    "Para retirar un producto se necesita un aviso que indique que no corresponde a VeganAlts.",
  "Profile not found.": "No se ha encontrado el perfil.",
  "Proposal not found.": "No se ha encontrado la propuesta.",
  "Publication expired. Refresh and retry.":
    "La publicación ha caducado. Actualiza la página y vuelve a intentarlo.",
  "Rating not found.": "No se ha encontrado la valoración.",
  "Refresh the current product before changing its line.":
    "Actualiza el producto actual antes de cambiar su gama.",
  "Remove your ratings before removing Tried state.":
    "Elimina tus valoraciones antes de quitar el estado “Ya lo he probado”.",
  "Report not found.": "No se ha encontrado el aviso.",
  "Select a valid photo report to remove a photo.":
    "Selecciona un aviso de foto válido para quitar una foto.",
  "Select a visible reported comment to hide it.":
    "Selecciona un comentario denunciado y visible para ocultarlo.",
  "Submission not found.": "No se ha encontrado el envío.",
  "The automatic check could not finish. Please try again later.":
    "La revisión automática no ha podido terminar. Inténtalo de nuevo más tarde.",
  "The catalog facts this proposal relies on changed after it was drafted. Request a fresh proposal.":
    "Los datos del catálogo en los que se basa esta propuesta han cambiado después de redactarla. Solicita una propuesta nueva.",
  "The file could not be decoded as a supported image.":
    "No se ha podido leer el archivo como una imagen compatible.",
  "The image could not be decoded.": "No se ha podido leer la imagen.",
  "The image could not be processed. Retry using the same key.":
    "No se ha podido procesar la imagen. Vuelve a intentarlo con la misma clave.",
  "The line already has this name.": "La gama ya tiene este nombre.",
  "The operator's request changed. Reopen your contribution before responding.":
    "La solicitud del equipo ha cambiado. Vuelve a abrir tu contribución antes de responder.",
  "The photo could not be processed. Retry with the same request.":
    "No se ha podido procesar la foto. Vuelve a intentarlo con la misma solicitud.",
  "The product changed while you were reviewing. Refresh before deciding.":
    "El producto ha cambiado mientras lo revisabas. Actualiza la página antes de decidir.",
  "The product changed. Refresh before confirming availability.":
    "El producto ha cambiado. Actualiza la página antes de confirmar la disponibilidad.",
  "The product changed. Review its current details before proposing this change.":
    "El producto ha cambiado. Revisa sus datos actuales antes de proponer este cambio.",
  "The product is already in this line.": "El producto ya está en esta gama.",
  "The proposal changed. Refresh before deciding.":
    "La propuesta ha cambiado. Actualiza la página antes de decidir.",
  "The report has new evidence. Refresh before deciding.":
    "El aviso tiene evidencia nueva. Actualiza la página antes de decidir.",
  "The security check did not respond. Please retry.":
    "La verificación de seguridad no ha respondido. Vuelve a intentarlo.",
  "The security check expired. Please complete it again.":
    "La verificación de seguridad ha caducado. Complétala de nuevo.",
  "These photos are already attached to another proposal or expired. Upload them again for this proposal.":
    "Estas fotos ya están adjuntas a otra propuesta o han caducado. Súbelas de nuevo para esta propuesta.",
  "These questions changed since this action. Review the newer change first.":
    "Estas preguntas han cambiado desde esta acción. Primero revisa el cambio más reciente.",
  "These results have changed. Please retry.":
    "Estos resultados han cambiado. Vuelve a intentarlo.",
  "These results have changed. Refresh the results and try again.":
    "Estos resultados han cambiado. Actualízalos e inténtalo de nuevo.",
  "This action did not change the catalog.":
    "Esta acción no ha cambiado el catálogo.",
  "This automatic check was replaced or expired. Please resubmit.":
    "Esta revisión automática ha sido reemplazada o ha caducado. Vuelve a enviarla.",
  "This category changed after the action. Review the newer change first.":
    "Esta categoría ha cambiado después de la acción. Primero revisa el cambio más reciente.",
  "This category changed. Refresh before editing.":
    "Esta categoría ha cambiado. Actualiza la página antes de editar.",
  "This comment changed after the decision. Review it before reversing.":
    "Este comentario ha cambiado después de la decisión. Revísalo antes de revertir.",
  "This comment changed. Refresh before deciding.":
    "Este comentario ha cambiado. Actualiza la página antes de decidir.",
  "This comment changed. Refresh before editing.":
    "Este comentario ha cambiado. Actualiza la página antes de editar.",
  "This comment changed. Reload the page before hiding it.":
    "Este comentario ha cambiado. Recarga la página antes de ocultarlo.",
  "This content is no longer available for reporting.":
    "Ya no se puede informar sobre este contenido.",
  "This contribution was rejected. Revise it before submitting again.":
    "Esta contribución ha sido rechazada. Corrígela antes de volver a enviarla.",
  "This evidence expired or is being reviewed. Refresh before retrying.":
    "Esta evidencia ha caducado o está en revisión. Actualiza la página antes de volver a intentarlo.",
  "This food changed. Refresh before choosing its countries.":
    "Este alimento ha cambiado. Actualiza la página antes de elegir sus países.",
  "This food changed. Refresh before editing its questions.":
    "Este alimento ha cambiado. Actualiza la página antes de editar sus preguntas.",
  "This food now has products in a country the action added, so it stays on there.":
    "Este alimento ahora tiene productos en un país que ha añadido la acción, así que sigue activado allí.",
  "This food's countries changed since this action. Review the newer change first.":
    "Los países de este alimento han cambiado desde esta acción. Primero revisa el cambio más reciente.",
  "This food’s detail questions changed. Refresh to see the current ones.":
    "Las preguntas de detalle de este alimento han cambiado. Actualiza la página para ver las actuales.",
  "This formula and category cannot currently be rated.":
    "Por ahora no se puede valorar esta fórmula en esta categoría.",
  "This idempotency key was used for a different upload.":
    "Esta clave de idempotencia se ha usado para otra subida.",
  "This photo slot is already reserved, or the submission/account has reached its image or daily byte allowance. Retry tomorrow for daily limits; use a fresh submission to change a reserved photo.":
    "Este espacio de foto ya está reservado, o el envío o la cuenta ha alcanzado su límite de imágenes o de bytes diarios. Si es un límite diario, vuelve a intentarlo mañana; para cambiar una foto reservada, usa un envío nuevo.",
  "This product has no line.": "Este producto no tiene gama.",
  "This product is already discontinued.":
    "Este producto ya está descatalogado.",
  "This proposal changed. Refresh before deciding.":
    "Esta propuesta ha cambiado. Actualiza la página antes de decidir.",
  "This proposal has already been decided.":
    "Esta propuesta ya se ha decidido.",
  "This record changed. Refresh the review before deciding.":
    "Este registro ha cambiado. Actualiza la revisión antes de decidir.",
  "This report changed. Refresh before deciding.":
    "Este aviso ha cambiado. Actualiza la página antes de decidir.",
  "This request key was used for different details. Start a new submission.":
    "Esta clave de solicitud se ha usado con otros datos. Inicia un envío nuevo.",
  "This submission changed or is already being finalized. Refresh its status.":
    "Este envío ha cambiado o ya se está finalizando. Actualiza su estado.",
  "This submission changed. Refresh its status.":
    "Este envío ha cambiado. Actualiza su estado.",
  "This submission has already been decided or is being published.":
    "Este envío ya se ha decidido o se está publicando.",
  "This submission has expired or is already being finalized.":
    "Este envío ha caducado o ya se está finalizando.",
  "This suggestion changed. Refresh before deciding.":
    "Esta sugerencia ha cambiado. Actualiza la página antes de decidir.",
  "This upload is processing or its allowance is exhausted. Retry later using the same request.":
    "Esta subida se está procesando o ya se ha agotado su límite. Vuelve a intentarlo más tarde con la misma solicitud.",
  "This upload is processing, has reached its retry limit, or today's upload allowance is exhausted. Try again later with the same key.":
    "Esta subida se está procesando, ha alcanzado su límite de reintentos o ya se ha agotado el límite de subidas de hoy. Vuelve a intentarlo más tarde con la misma clave.",
  "Today's comment allowance is exhausted, or this formula changed. Refresh and try again tomorrow.":
    "Ya se ha agotado el límite de comentarios de hoy, o esta fórmula ha cambiado. Actualiza la página e inténtalo de nuevo mañana.",
  "Today's comment allowance is exhausted. Please try again tomorrow.":
    "Ya se ha agotado el límite de comentarios de hoy. Inténtalo de nuevo mañana.",
  "Use 3–30 letters, numbers or underscores, starting with a letter. This handle must not be reserved.":
    "Usa de 3 a 30 letras, números o guiones bajos, empezando por una letra. Este nombre de usuario no debe estar reservado.",
  "Use PUT to save a rating.": "Usa PUT para guardar una valoración.",
  "Use a recognizable brand and product name, with more than a package size.":
    "Usa una marca y un nombre de producto reconocibles, no solo el tamaño del envase.",
  "Use reintroduction for a discontinued product.":
    "Usa la reintroducción para un producto descatalogado.",
  "You already posted this comment on this product.":
    "Ya has publicado este comentario en este producto.",
  "Your name could not be checked. Please try again later.":
    "No se ha podido revisar tu nombre. Inténtalo de nuevo más tarde.",
  "Your profile could not be created. Please try again.":
    "No se ha podido crear tu perfil. Inténtalo de nuevo.",
  "You’ve suggested the most foods allowed today. Try again tomorrow, or choose an existing food.":
    "Ya has sugerido el máximo de alimentos permitido hoy. Inténtalo de nuevo mañana o elige un alimento existente.",
  "You’ve suggested the most foods allowed today. Try again tomorrow.":
    "Ya has sugerido el máximo de alimentos permitido hoy. Inténtalo de nuevo mañana.",
};
