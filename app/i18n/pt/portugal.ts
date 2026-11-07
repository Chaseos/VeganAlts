import type { Dictionary } from "..";

// Portugal's differences from the shared dictionary; anything else falls through.
// Terms and rules: docs/operations/translation-glossary.md
export const portugal: Partial<Dictionary> = {
  "account.activityLabel": "A sua atividade",
  "account.displayNameLabel": "Nome a apresentar (opcional)",
  "account.handleHint":
    "De 3 a 30 letras, números ou sublinhados. Comece por uma letra.",
  "account.handleLabel": "Nome de utilizador público",
  "account.intro":
    "O nome de utilizador e o nome a apresentar que escolher são públicos. O seu e-mail e o histórico das suas avaliações continuam privados.",
  "account.metaTitle": "O seu perfil · VeganAlts",
  "account.myContributions": "As minhas contribuições",
  "account.myRatings": "As minhas avaliações",
  "account.save": "Guardar perfil",
  "account.saved": "Perfil guardado.",
  "account.savedProducts": "Produtos guardados",
  "account.signOut": "Terminar sessão",
  "account.signOutFailed":
    "Não foi possível terminar a sessão. Tente novamente.",
  "account.title": "O seu perfil",
  "addProduct.accepted":
    "Quando for aceite, o produto será publicado neste país ({country}).",
  "addProduct.acceptedRated":
    "Quando for aceite, o produto será publicado neste país ({country}) e a sua avaliação será guardada.",
  "addProduct.addingTo": "A adicionar a",
  "addProduct.allergens": "Alergénios",
  "addProduct.allergensAdded": {
    one: "{number} alergénio adicionado",
    other: "{number} alergénios adicionados",
  },
  "addProduct.alreadyListed":
    "{name} já consta da lista, incluindo noutros tamanhos de embalagem.",
  "addProduct.alsoCalled": "Também chamado {name}",
  "addProduct.cannotAccept": "Este envio não pode ser aceite.",
  "addProduct.checkAndRetry":
    "Verifique os detalhes do produto e tente novamente.",
  "addProduct.checkDetails": "Verificamos os detalhes.",
  "addProduct.checkNewFood":
    "Verificamos o seu novo alimento “{name}” juntamente com o seu produto. Isto demora até três dias.",
  "addProduct.checkedNothing":
    "Verifiquei os ingredientes e não encontrei nada de origem animal",
  "addProduct.confirmNoPhoto":
    "Com uma foto dos ingredientes ou da tabela nutricional, outro membro pode confirmar; sem ela, um moderador verifica.",
  "addProduct.draftNotSaved":
    "Este rascunho não está guardado em segurança neste dispositivo.",
  "addProduct.followBefore":
    "Pode acompanhar o envio e responder a qualquer pergunta na página",
  "addProduct.foodRequired": "Que alimento substitui? (obrigatório)",
  "addProduct.foundAtNote":
    "“Costuma ser encontrado em”, não é stock em tempo real. Até 10 lojas.",
  "addProduct.foundIt":
    "Encontrou aqui? Avalie em vez de adicionar de novo. Um sabor que ainda não está listado entra na mesma gama.",
  "addProduct.heldTitle": "Obrigado, o seu produto está em revisão",
  "addProduct.ingredientLink":
    "Ligação para os ingredientes no site da marca (opcional)",
  "addProduct.intro":
    "Indique primeiro o básico. Todo o resto é opcional e qualquer pessoa pode acrescentar depois.",
  "addProduct.keepOpen":
    "Mantenha esta página aberta durante a edição. Se a recarregar ou sair, pode perder o texto ou as fotos mais recentes.",
  "addProduct.linesChecking":
    "A verificar o que está listado da marca {brand}…",
  "addProduct.linesElsewhere": {
    one: "{number} gama de {brand} noutros alimentos",
    other: "{number} gamas de {brand} noutros alimentos",
  },
  "addProduct.lookingBrands": "A procurar marcas…",
  "addProduct.newFoodLegend": "Novo alimento (revisto com o produto)",
  "addProduct.newFoodNote":
    "Verificamos, no prazo de três dias, se os novos alimentos são duplicados. O seu produto será publicado quando o alimento for aceite.",
  "addProduct.newFoodSummary": "{name} (novo alimento, revisto com o produto)",
  "addProduct.noMatch":
    "Nenhum alimento corresponde a “{text}”. Verifique a grafia.",
  "addProduct.noMatchSuggest":
    "Nenhum alimento corresponde a “{text}”. Verifique a grafia ou sugira-o como novo alimento.",
  "addProduct.noStores":
    "Ainda não há lojas listadas para este país ({country}). Pode adicionar uma na página do produto depois de ele ser publicado.",
  "addProduct.notSavedUntil":
    "O que preencher agora não será guardado até escolher “Começar um novo”.",
  "addProduct.otherFoods": "Outros alimentos que substitui",
  "addProduct.photosNotRestored":
    "Não foi possível restaurar as fotos guardadas neste dispositivo. Escolha-as novamente antes de enviar.",
  "addProduct.progressChecking": "A verificar o seu produto…",
  "addProduct.progressFinishing": "A concluir…",
  "addProduct.progressUploading": "A carregar a foto {number} de {total}…",
  "addProduct.ratingSaved":
    "Será guardada como a sua avaliação quando o produto for publicado.",
  "addProduct.ratingSavedClear":
    "{meaning}. Será guardada como a sua avaliação quando o produto for publicado; toque novamente para limpar.",
  "addProduct.recordPackage": "Registe o que diz a embalagem.",
  "addProduct.retrySaving": "Tentar guardar o rascunho de novo",
  "addProduct.reviewThanks":
    "Obrigado. Verificamos antes de publicar. As suas fotos ficam privadas até lá.",
  "addProduct.savedOnDevice": "{product} está guardado neste dispositivo.",
  "addProduct.savedOnDeviceGeneric":
    "Um produto que começou está guardado neste dispositivo.",
  "addProduct.submitting": "A enviar…",
  "addProduct.tasty": "Quão saboroso é, seja ou não parecido com o original?",
  "addProduct.thisLine": "esta gama",
  "addProduct.triedIt": "Já experimentou? Qual é a semelhança com “{food}”?",
  "addProduct.unfinishedTitle": "Tem um produto por concluir",
  "addProduct.updateDetails":
    "Atualize os detalhes e adicione as fotos que quer que sejam revistas novamente. O seu",
  "addProduct.viewSubmission": "Ver o seu envio",
  "aisle.anyoneCanSuggest":
    "Qualquer pessoa pode sugerir. Passa a ter um ranking próprio quando as pessoas adicionarem e avaliarem produtos.",
  "aisle.bringFood": "para trazer o respetivo alimento para cá.",
  "aisle.missingHint":
    "Por enquanto, o seu alimento vai para a categoria mais próxima. Uma nova será aberta quando pessoas suficientes a pedirem.",
  "aisle.missingLabel": "Que categoria falta? (opcional)",
  "aisle.noneFit": "Nenhuma destas serve mesmo",
  "aisle.tryAbove":
    "Use a barra de pesquisa acima ou sugira-o como novo alimento.",
  "allergen.checkPackage": "Verifique sempre a embalagem.",
  "allergen.citeHint":
    "Citar a foto dos ingredientes ou da tabela nutricional da fórmula permite que outros colaboradores confirmem a declaração. Sem ela, a equipa faz a revisão.",
  "allergen.contains": "Contém: {list}",
  "allergen.fromLabels":
    "Os alergénios vêm dos rótulos das embalagens e podem mudar com a receita.",
  "allergen.lists": "Indica alergénios",
  "allergen.none": "Nenhum dos principais alergénios indicado no rótulo",
  "allergen.noneDeclared": "Nenhum alergénio declarado no rótulo",
  "allergen.noneOfThese": "Nenhuma destas; vou explicar na observação",
  "allergen.onFile": "Registo atual:",
  "allergen.record":
    "Registe o que diz a embalagem desta fórmula. As confirmações verificam se a declaração coincide com o rótulo, nunca se um produto é seguro.",
  "allergen.whichPhoto": "Que foto mostra isso?",
  "appearance.current": "Aspeto: {theme}",
  "appearance.label": "Aspeto",
  "bars.detailScores": "Pontuações por detalhe",
  "brand.foundOne": "Encontrou algum aqui? Adicione-o e entra nos rankings.",
  "brandChange.line": "Gama",
  "brandChange.newLine": "Uma nova gama",
  "brandChange.newLineName": "Nome da nova gama",
  "brandChange.note":
    "O produto mantém o endereço, as fotos e as avaliações. Uma gama pertence a uma só marca, por isso passa para uma gama da nova marca.",
  "category.allergenSource":
    "Os alergénios vêm dos rótulos das embalagens, confirmados por membros com base na foto do rótulo.",
  "category.closestOriginal": "Mais parecido ao original",
  "category.fewAnswers":
    "Estes têm menos de 5 respostas sobre “{detail}”, por isso seguem o ranking.",
  "category.flagTastiest": "Mais saboroso n.º 1",
  "category.flagTop": "Alternativa n.º 1",
  "category.how1":
    "Quem já experimentou um produto avalia, de 1 a 5, quão parecido é com “{food}” no mesmo sabor. A receita de uma marca e os seus sabores são classificados em conjunto: cada pessoa conta uma vez, pela média dos sabores que avaliou, ajustada pelo número de pessoas que avaliaram. As alternativas avaliadas por menos de 10 pessoas mostram o selo Preliminar. Mais saboroso classifica as respostas a “quão saboroso é?” do mesmo modo e nunca altera o ranking Mais parecido ao original.",
  "category.howDetails":
    "{list} são avaliações opcionais por detalhe que explicam a pontuação.",
  "category.howTitle": "Como funcionam estas pontuações",
  "category.newNote":
    "Adicionados nos últimos {days} dias. Ser novo nunca aumenta uma pontuação.",
  "category.newWaiting":
    "Um produto novo pode ainda estar à espera da primeira avaliação. Veja abaixo ou alargue os filtros.",
  "category.noTastyYet":
    "Ninguém disse ainda se são saborosos, por isso seguem o ranking Mais parecido ao original.",
  "category.rateBelow":
    "Avalie uma abaixo ou adicione um produto que já experimentou.",
  "category.replacing": "Está a substituir outra coisa?",
  "category.sortDetailHint": "Pontuação por detalhe",
  "category.sortTrendingHint": "A subir neste trimestre",
  "category.unratedNote":
    "Estes não têm avaliações, por isso não estão classificados. Já experimentou algum?",
  "chrome.skipToContent": "Saltar para o conteúdo",
  "code.accepted": "aceite",
  "code.copyright": "direitos de autor",
  "code.off_topic": "fora do tema",
  "code.online_only": "apenas online",
  "code.publishing": "a publicar",
  "comingSoon.lead":
    "O hambúrguer que acerta em cheio. A alternativa ao queijo que derrete mesmo. Encontre alternativas aos alimentos que ama, classificadas por quem já experimentou.",
  "comingSoon.noteLead":
    "Uma forma melhor de encontrar o seu próximo favorito.",
  "comingSoon.noteStrong": "Estamos a preparar tudo.",
  "comingSoon.step1Body":
    "Comece pelo que quer substituir. Descubra as alternativas disponíveis no seu país.",
  "comingSoon.step1Title": "Encontre a sua alternativa",
  "comments.add": "Adicione a sua experiência",
  "comments.anyUse": "Qualquer utilização",
  "comments.awaiting": "A aguardar revisão de um moderador",
  "comments.awaitingLabel": "Os seus comentários a aguardar revisão",
  "comments.confirmDelete":
    "Eliminar o seu comentário? Esta ação não pode ser anulada.",
  "comments.delete": "Eliminar",
  "comments.deleted": "O seu comentário foi eliminado.",
  "comments.editPending":
    "A sua edição vai aparecer depois de um moderador a verificar.",
  "comments.editYours": "Editar o seu comentário",
  "comments.hideExplain":
    "Ocultar este comentário do público? O texto e os votos são preservados, e pode restaurá-lo através do histórico de decisões do produto.",
  "comments.intro":
    "Partilhe como se compara: sabor, textura, preparação e há quanto tempo comeu o original. Vote se um comentário ajuda alguém a perceber o produto, não se concorda com ele.",
  "comments.loading": "A carregar…",
  "comments.posted": "O seu comentário foi publicado.",
  "comments.posting": "A publicar…",
  "comments.published":
    "Publicado. Pode demorar alguns minutos a aparecer para todos.",
  "comments.recentLabel": "Os seus comentários recentes",
  "comments.saveChanges": "Guardar alterações",
  "comments.signIn": "Inicie sessão para comentar e votar",
  "comments.thanksPending":
    "Obrigado. O seu comentário vai aparecer depois de um moderador o verificar.",
  "comments.updated": "O seu comentário foi atualizado.",
  "comments.whyReport": "Porquê denunciar?",
  "common.sending": "A enviar…",
  "community.errNetwork":
    "Verifique a sua ligação e tente novamente. O que preencheu continua aqui.",
  "community.errRate":
    "Demasiados pedidos. Aguarde um minuto e tente novamente. O que preencheu continua aqui.",
  "community.errSave": "Não foi possível guardar o pedido. Tente novamente.",
  "community.errServer":
    "O servidor não conseguiu concluir este pedido. Tente novamente. O que preencheu continua aqui.",
  "community.errSession":
    "A sua sessão expirou. Inicie sessão novamente e tente de novo. O que preencheu continua aqui.",
  "community.evidenceHint":
    "Use uma ligação direta para informações relevantes do fabricante ou de certificação.",
  "community.evidenceReviewed":
    "A equipa revê a evidência antes de alterar o catálogo.",
  "community.guidelinesMiddle": "e são revistas como descrito em",
  "community.manufacturerUnknown": "Não sei / não indicado",
  "community.noScript":
    "É preciso ativar o JavaScript para adicionar ou editar contribuições. Ative-o e volte a carregar a página para continuar.",
  "community.reasonWrongLine": "Não faz parte desta gama",
  "community.signInAgain": "Inicie sessão novamente (novo separador)",
  "community.slotPrepared": "Foto da preparação",
  "contribute.adminNotice":
    "As alterações guardadas valem de imediato, sem revisão. Cada uma fica registada no Histórico de decisões e pode ser revertida.",
  "contribute.canonicalRetailer": "Retalhista principal",
  "contribute.checkIngredients": "Verificar os ingredientes",
  "contribute.chooseRetailer": "Escolha um retalhista",
  "contribute.experience": "A sua experiência",
  "contribute.findRetailer": "Encontrar um retalhista",
  "contribute.foundAtIntro":
    "Indique onde este produto costuma ser vendido neste país ({country}). Isto não indica stock em tempo real.",
  "contribute.history": "Histórico da equipa e reversões →",
  "contribute.intro":
    "A sua evidência ajuda a equipa a decidir com informação. As avaliações existentes continuam com a fórmula original.",
  "contribute.introAdmin":
    "As suas edições valem de imediato. As avaliações existentes continuam com a fórmula original.",
  "contribute.itsLineNow": "{name} (gama atual)",
  "contribute.kindAllergens": "Alergénios no rótulo",
  "contribute.kindRelationships":
    "Gama, produtos relacionados e alimentos em que entra no ranking",
  "contribute.kindRetailerStatus": "Problema de disponibilidade em retalhista",
  "contribute.lineNote":
    "Os sabores da mesma receita base partilham uma gama e um ranking. A equipa revê a mudança para outra gama.",
  "contribute.metaTitle": "Contribuir para o catálogo · VeganAlts",
  "contribute.notCurrent": "Acredito que esta relação já não é atual",
  "contribute.noticeDiscontinue":
    "Uma descontinuação aceite remove o produto da pesquisa ativa e da elegibilidade para o ranking. O histórico do produto e da fórmula continua visível.",
  "contribute.nutritionAllergensPhoto":
    "Foto da tabela nutricional e dos alergénios",
  "contribute.photoChecked": "A foto que verificou",
  "contribute.photoLimits":
    "Até 10 MiB por foto. Enquanto uma proposta está aberta para confirmação da comunidade, os colaboradores com sessão iniciada podem ver as evidências dela; caso contrário, ficam privadas durante a revisão.",
  "contribute.photoUnchecked":
    "A foto dos ingredientes está aqui, mas ainda ninguém a verificou.",
  "contribute.precision":
    "Use apenas a precisão que as suas evidências sustentam.",
  "contribute.proposeRetailer": "Propor um retalhista",
  "contribute.proposedStatus": "Estado proposto",
  "contribute.recipeLine": "Gama de receita",
  "contribute.reportHint":
    "Escolha “Não pertence ao VeganAlts” se o produto não se destina a imitar um original de origem animal, ou se uma mistura não tem uma preparação vegana indicada pelo fabricante. Use “categoria errada” se o produto pertence ao site, mas está no alimento errado.",
  "contribute.reportNote":
    "Dúvidas sobre ingredientes têm prioridade. Uma denúncia não altera os dados do produto até a equipa a analisar. Se voltar a denunciar, as suas evidências são atualizadas e a denúncia conta uma só vez.",
  "contribute.reportTarget": "O que quer denunciar?",
  "contribute.retailerCheck":
    "A equipa confirma a identidade e o país do retalhista antes de este ficar disponível para seleção.",
  "contribute.retailerName": "Nome do retalhista",
  "contribute.retailerSite": "Site oficial do retalhista",
  "contribute.retailerWhy": "Porque é que este retalhista deve ser adicionado?",
  "contribute.revisePhotos": "Rever fotos",
  "contribute.saveAvailability": "Guardar disponibilidade",
  "contribute.saveChange": "Guardar alteração",
  "contribute.saving": "A guardar…",
  "contribute.searchPlaceholder": "Pesquisar por nome",
  "contribute.selectRetailer": "Selecione um retalhista",
  "contribute.stanceNote":
    "Mantemos uma posição atual por pessoa. Confirmar de novo atualiza a data, mas não aumenta o seu peso. A equipa decide se uma relação será removida.",
  "contribute.statusNotCurrent": "Já não está atual",
  "contribute.submitRetailer": "Enviar proposta de retalhista",
  "contribute.tabRetailer": "Disponibilidade em retalhistas",
  "contribute.whatToChange": "O que quer alterar?",
  "country.note":
    "Os rankings de cada país vêm de quem lá vive. Países vazios aguardam os primeiros produtos.",
  "detail.allergensLabel": "Alergénios no rótulo:",
  "detail.allergensOnFile": "Alergénios registados",
  "detail.categoryScore": "{category}: pontuação {score} ({types})",
  "detail.followUpLink": "envio original e das respetivas evidências",
  "detail.joinsLine": "Entra na gama:",
  "detail.keepsLine": "Mantém a gama",
  "detail.line": "Gama:",
  "detail.receiptReady":
    "O comprovativo do envio está pronto. Conclua as fotos e a revisão final na página do envio.",
  "detail.retailer": "Retalhista:",
  "detail.retailerEvidence": "Evidências atuais do retalhista",
  "draft.chooseAllergens":
    "Escolha os alergénios que o rótulo indica ou escolha “Nenhum alergénio declarado”.",
  "draft.chooseFood": "Escolha o alimento que substitui ou sugira um novo.",
  "draft.chooseLine":
    "Escolha o produto, se estiver na lista, um novo sabor de uma gama ou outra coisa da marca.",
  "draft.enterBrand": "Indique a marca.",
  "draft.enterFlavor": "Indique o sabor.",
  "draft.enterLineName": "Indique o nome sem o sabor.",
  "draft.enterName": "Indique o nome do produto.",
  "draft.httpsLink":
    "Use uma ligação HTTPS, como https://brand.example/ingredients.",
  "draft.nameFood": "Indique o alimento que substitui.",
  "error.failedTitle": "Algo correu mal.",
  "error.forbiddenBody":
    "A sua conta não tem permissão para aceder a esta página.",
  "error.notFoundBody": "A ligação pode ter mudado. Volte ao início.",
  "error.search": "Pesquisar alimentos",
  "fact.alias": "Outro nome que as pessoas pesquisam",
  "fact.categoryAdd": "Outro alimento que substitui",
  "fact.flavorHint":
    "Deixe em branco para a versão original ou tradicional da gama. O produto mantém o endereço e as avaliações. Anexe uma foto da frente que mostre o novo nome.",
  "fact.moveNote":
    "Mover desmarca os alimentos atuais; volte a marcar um deles para listar o produto nos dois. As avaliações nunca se perdem: um alimento avaliado mantém-nas, fora do ranking, e o produto começa sem avaliações no novo alimento.",
  "fact.seasonalNo": "Não, é vendido todo o ano",
  "filters.allergensPanel": "Alergénios a evitar",
  "filters.avoid": "Evitar produtos cujo rótulo indica",
  "filters.freeFrom": "Filtro de alergénios:",
  "filters.freeLabelAny":
    "Filtro de alergénios: nenhum. Nenhum alergénio escolhido",
  "filters.freeLabelChosen":
    "Filtro de alergénios: {summary}. Alergénios: {names}",
  "filters.freeNote":
    "Só entram produtos com rótulo confirmado. “Pode conter” também exclui o produto. Verifique sempre a embalagem. As suas escolhas ficam guardadas neste dispositivo para todos os rankings deste país.",
  "filters.noAllergen": "Sem filtro de alergénios",
  "filters.noStores":
    "Ainda não há lojas indicadas para estas alternativas neste país.",
  "filters.pickStores": "Escolha todas as lojas onde compra",
  "filters.sortNote":
    "Mais parecido ao original e Mais saboroso são os rankings. As outras ordenações nunca os alteram.",
  "filters.storesNote":
    "Costuma ser encontrado em qualquer uma das lojas escolhidas, segundo os membros neste país ({country}). As suas escolhas ficam guardadas neste dispositivo para todos os rankings deste país.",
  "filters.storesPanel": "Lojas onde compra",
  "footer.contact": "Contacto",
  "footer.reportTranslation": "Comunicar um problema de tradução",
  "footer.veganStatus": "Estado vegano",
  "group.bakeryBaking": "Padaria e pastelaria",
  "group.meatSeafood": "Carne, peixe e marisco",
  "group.saucesDips": "Molhos, pastas e patés",
  "header.search": "Pesquisar",
  "home.heroLede":
    "Pesquise um alimento que já compra. Verá os produtos veganos que as pessoas dizem ser os mais próximos, classificados.",
  "home.heroTitle": "O que quer substituir?",
  "home.insteadOf": "Em vez de “{food}”",
  "home.metaDescription":
    "Pesquise um alimento que já compra e veja os produtos veganos que as pessoas consideram mais próximos, classificados.",
  "home.newTitle": "Novos e a precisar de avaliações",
  "home.noRankingsBody":
    "Os rankings daqui vêm de pessoas que vivem neste país ({name}). Adicione um produto vegano que compra, ou sugira um alimento que ele substitui, e passa a ter um ranking próprio quando as pessoas o avaliarem.",
  "home.pointAt":
    "Passe o cursor sobre outro alimento da lista para ver uma pré-visualização.",
  "home.suggestLead": "Não vê o alimento que está a substituir?",
  "home.suggestTail": "para lhe dar um ranking próprio.",
  "home.trendingNote": "A subir neste trimestre · nunca altera os rankings",
  "home.waitingBody":
    "A melhor opção para estes alimentos tem pontuação inferior a 3,5, ou ainda não há nada classificado. Conhece uma melhor? Adicione-a e entra no ranking.",
  "home.waitingTitle": "Ainda à espera de uma ótima alternativa",
  "menu.accountSettings": "Definições da conta",
  "menu.myContributions": "As minhas contribuições",
  "menu.myRatings": "As minhas avaliações",
  "menu.operators": "Equipa",
  "menu.saved": "Produtos guardados",
  "menu.signIn": "Iniciar sessão",
  "menu.signedInAs": "Sessão iniciada como {handle}",
  "myContributions.checksNote":
    "Estas verificações são automáticas. As suas contribuições ficam privadas até terminarem.",
  "myContributions.eyebrow": "As suas contribuições para o catálogo",
  "myContributions.metaTitle": "As minhas contribuições · VeganAlts",
  "myContributions.rejected": "Rejeitada — reveja antes de voltar a enviar",
  "myContributions.replacedBefore": "Este registo foi substituído pelo seu",
  "myContributions.resubmit": "Volte a enviar",
  "myContributions.revisedLink": "envio revisto",
  "myContributions.status": "Estado: {status}",
  "myContributions.statusTitle": "Estado da contribuição",
  "myContributions.title": "As minhas contribuições",
  "myRatings.archived":
    "Duplicado arquivado · A sua avaliação foi preservada aqui",
  "myRatings.emptyBody":
    "Explore um alimento, experimente uma alternativa e diga quão parecida é.",
  "myRatings.emptyTitle": "O seu próximo favorito está à espera.",
  "myRatings.eyebrow": "A sua experiência, guardada",
  "myRatings.intro":
    "Este histórico só é visível para si. As atualizadas mais recentemente aparecem primeiro.",
  "myRatings.metaTitle": "As minhas avaliações · VeganAlts",
  "myRatings.pages": "Páginas das minhas avaliações",
  "myRatings.taste": "Pontuação de sabor:",
  "myRatings.title": "As minhas avaliações",
  "nav.breadcrumb": "Caminho de navegação",
  "nav.loadingPage": "A carregar a página…",
  "pending.label": "A sua avaliação pendente",
  "pending.openCurrent": "Abra a fórmula atual e escolha uma nova pontuação →",
  "pending.retry": "Tentar guardar a avaliação escolhida",
  "pending.unsaved": "A avaliação que escolheu não foi guardada.",
  "personal.connectionLost": "Ligação perdida. Tente novamente.",
  "personal.connectionLostSelection":
    "Ligação perdida. A sua escolha continua aqui; tente de novo quando quiser.",
  "personal.loadFailed":
    "Não foi possível carregar as suas informações. Tente novamente.",
  "personal.loadFailedShort": "Não foi possível carregar as suas informações.",
  "personal.notSaved": "A sua avaliação não foi guardada. Tente novamente.",
  "personal.signingIn": "A continuar para o início de sessão…",
  "personal.storage":
    "O seu navegador não conseguiu guardar esta escolha. Ative o armazenamento do separador e tente novamente.",
  "personal.unconfirmed":
    "Não foi possível confirmar a avaliação guardada. Tente novamente.",
  "photo.nutrition": "Nutrição e alergénios",
  "photoAdmin.file": "Ficheiro da foto: {slot}",
  "photoAdmin.manage": "Gerir fotos",
  "photoAdmin.notSaved": "Foto não guardada",
  "photoAdmin.rotateLeft": "Rodar para a esquerda",
  "photoAdmin.rotateLeftLabel": "Rodar a foto de {slot} para a esquerda",
  "photoAdmin.rotateRight": "Rodar para a direita",
  "photoAdmin.rotateRightLabel": "Rodar a foto de {slot} para a direita",
  "photoAdmin.rotated": "Foto de {slot} rodada.",
  "photoAdmin.saveFailed": "Não foi possível guardar a foto.",
  "photoAdmin.saving": "A guardar foto…",
  "photoProposal.blurry": "A foto atual está desfocada ou ilegível",
  "photoProposal.moderatorReview":
    "A troca de uma foto de ingredientes ou de tabela nutricional é revista por um moderador.",
  "photoProposal.save": "Guardar foto",
  "photoProposal.staysUntil":
    "A foto atual permanece até a nova ser aceite, e as fotos anteriores continuam com a fórmula que documentam.",
  "photoProposal.uploading": "A carregar…",
  "photoProposal.why": "Porque é que uma nova foto é melhor?",
  "photos.loading": "A carregar foto…",
  "preview.banner":
    "Pré-visualização de desenvolvimento · Catálogo de demonstração e avaliações de exemplo",
  "preview.label": "Pré-visualização de desenvolvimento",
  "product.addAllergens": "Adicionar os alergénios",
  "product.addRetailer": "Viu noutro sítio? Adicione ou confirme um retalhista",
  "product.alsoRankedLine": "{rank}.º de {of} · {people}",
  "product.availabilityNote":
    "Relatos da comunidade sobre disponibilidade, não stock em tempo real.",
  "product.checkedOn": "(verificado em {date}).",
  "product.classificationProvisional":
    "Provisória: as evidências carregadas e os textos da embalagem, por si sós, não bastam para a verificação.",
  "product.classificationRecorded":
    "Só é apresentada a classificação registada para esta fórmula.",
  "product.classificationReviewed": "Classificação revista pela equipa.",
  "product.closerLook": "Olhar mais de perto",
  "product.correctAllergens": "Corrigir os alergénios",
  "product.description":
    "Consulte {name}, as pontuações para cada alimento, o histórico de fórmulas e a experiência da comunidade.",
  "product.detailFrom":
    "De {people} que adicionaram pontuações por detalhe a este sabor.",
  "product.factsChecked":
    "Verificados por membros com fotos da embalagem. Viu algum erro?",
  "product.firstSwap": "Alternativa n.º 1 para “{food}”",
  "product.historicalScores":
    "As pontuações anteriores ficam guardadas. Escolha a fórmula atual para adicionar a sua experiência.",
  "product.historicalTitle": "Fórmula anterior · Só de leitura",
  "product.labelUnknown": "Não registado",
  "product.liveAddDetail": "Adicione pontuações por detalhe",
  "product.liveJoins": "para que entre no ranking.",
  "product.livePending": "A sua avaliação será guardada dentro de instantes.",
  "product.liveRated": "A sua avaliação de {rating}/5 foi guardada.",
  "product.liveTitle": "O seu produto está publicado",
  "product.manage": "Gerir produto",
  "product.noCertification":
    "Nenhuma certificação de terceiros registada para esta fórmula.",
  "product.noRetailers": "Ainda nenhuma confirmação de retalhista.",
  "product.nobodyReported": "Ainda ninguém indicou onde é vendido.",
  "product.notRanked": "Ainda não classificado",
  "product.onlineSupplement": "Complemento de ingredientes online",
  "product.ownRanking":
    "Cada alimento tem o seu próprio ranking, por isso o mesmo produto pode ter pontuações diferentes consoante a utilização.",
  "product.ownRatings":
    "Cada produto e cada país mantém as suas próprias avaliações.",
  "product.rankOfFor": "{rank}.º de {of} para “{food}”",
  "product.ratingsUnavailable":
    "De momento, as avaliações não estão disponíveis para este alimento.",
  "product.tapStores":
    "Toque em todas as lojas onde compra para as guardar neste dispositivo. Os rankings vão mostrar o que encontra em qualquer uma delas.",
  "product.toFood": "a “{food}”",
  "product.tooFew": "Ainda poucas avaliações",
  "product.underReview":
    "A equipa está a analisar uma dúvida sobre os ingredientes. Esta fórmula fica fora dos rankings ativos e sem novas avaliações até que a dúvida seja resolvida.",
  "product.verifiedNoSource":
    "Não havia lista de ingredientes legível na embalagem nem fonte online.",
  "product.verifiedOnline":
    "Nenhuma lista legível na embalagem; verificado numa fonte online do produto exato.",
  "product.yourRating": "A sua avaliação",
  "product.yours": "a sua",
  "ranking.overall": "n.º {rank} no geral",
  "ranking.rising": "a subir neste trimestre",
  "ranking.score": "Pontuação",
  "rating.closeQuestion": "Já experimentou? Qual é a semelhança com “{food}”?",
  "rating.closeQuestionFlavored":
    "Já experimentou? Qual é a semelhança com “{food}” do mesmo sabor?",
  "rating.conflict": "Esta fórmula ou as perguntas mudaram.",
  "rating.help":
    "Responda a uma das perguntas ou às duas. Cada escolha é guardada de imediato; toque nela outra vez para limpar. A sua avaliação marca esta fórmula como experimentada.",
  "rating.helpSignedOut":
    "Escolha uma pontuação; vai iniciar sessão para a guardar.",
  "rating.lastAteQuestion": "Quando comeu “{food}” pela última vez?",
  "rating.loading": "A carregar a sua avaliação…",
  "rating.noscript":
    "É preciso ativar o JavaScript para guardar uma avaliação. Ative-o e recarregue a página para avaliar este produto.",
  "rating.queueBoth": "{score}/5; pontuação de sabor {taste}/5",
  "rating.queueFailed": "A sua avaliação não foi guardada. Tente novamente.",
  "rating.queueRemoved":
    "Avaliação removida. Esta fórmula está marcada como experimentada.",
  "rating.queueSaved":
    "{answer} guardado. Esta fórmula está marcada como experimentada.",
  "rating.queueSavedDetails": {
    one: "{answer} guardado com {number} detalhe. Esta fórmula está marcada como experimentada.",
    other:
      "{answer} guardado com {number} detalhes. Esta fórmula está marcada como experimentada.",
  },
  "rating.queueTaste": "pontuação de sabor {score}/5",
  "rating.recencyNote":
    "Mostra a semelhança percebida por quem ainda come o original. Nunca altera o peso da sua avaliação.",
  "rating.retrySaving": "Tentar guardar de novo: {target}",
  "rating.tasteScore": "Pontuação de sabor: {taste}/5",
  "rating.tasteTarget": "pontuação de sabor {taste}/5",
  "rating.tastyQuestion":
    "Quão saboroso é, seja ou não parecido com o original?",
  "rating.yourAnswers": "· as suas respostas",
  "rating.yours": "A sua avaliação: {score}/5",
  "rating.yoursTaste": "A sua avaliação de sabor: {taste}/5",
  "reportFood.intro": "Diga-nos o que há de errado na página deste alimento.",
  "reportFood.thanks": "Obrigado, vamos analisar.",
  "reportTranslation.intro":
    "Diga-nos quando um texto estiver errado, confuso ou estranho. Lemos todos os relatos.",
  "reportTranslation.metaTitle":
    "Comunicar um problema de tradução · VeganAlts",
  "reportTranslation.textLabel": "Que texto está errado? (obrigatório)",
  "reportTranslation.thanks": "Obrigado, vamos analisar.",
  "reportTranslation.title": "Comunicar um problema de tradução",
  "responses.confirmed": "Obrigado. A sua confirmação foi registada.",
  "responses.disagreed": "Obrigado. Um moderador vai rever a discordância.",
  "responses.evidenceAttached": "Obrigado. A sua evidência foi anexada.",
  "responses.intro":
    "Confirme apenas o que verificou pessoalmente, por exemplo na embalagem. As alterações de baixo risco são aplicadas após confirmação independente; a informação protegida vai sempre para um moderador.",
  "responses.own": "A sua proposta",
  "responses.title": "Alterações sugeridas",
  "safety.allergens": "Alergénios",
  "safety.checkIngredients": "Verifique os ingredientes",
  "safety.checkPackage": "Verifique sempre a embalagem.",
  "safety.indiaMark":
    "A marca verde de vegetariano da Índia não é um selo de produto vegano, porque os alimentos vegetarianos podem conter laticínios. Escolha Rotulado como vegano apenas se a embalagem disser vegano ou tiver o logótipo vegano.",
  "safety.ingredientsUnchecked": "Ingredientes ainda não verificados",
  "safety.optVegan": "Vegano — requer verificação da equipa",
  "safety.uncheckedChoose":
    "Ingredientes ainda não verificados. Escolha a foto dos ingredientes que verificou e o que ela mostra. Outro membro confirma e qualquer discordância vai para um moderador.",
  "safety.uncheckedHint":
    "Sem foto ou ligação dos ingredientes, o produto mostra “Ingredientes ainda não verificados” até alguém os adicionar. As fotos são adicionadas na etapa O básico.",
  "safety.uncheckedNoPhoto":
    "Quem adicionou este produto não incluiu os ingredientes. Tem a embalagem consigo?",
  "safety.uncheckedWithPhoto":
    "Ainda ninguém verificou os ingredientes deste produto com a foto do rótulo.",
  "safety.veganStatus": "Estado vegano",
  "save.checking": "A verificar a sua conta. Tente novamente.",
  "save.label": "Guardar {name}",
  "save.saved": "Guardado.",
  "save.savedTo": "Guardado em",
  "save.title": "Guardar",
  "save.titleSaved": "Guardado",
  "save.unchanged": "A sua lista de guardados não mudou. Tente novamente.",
  "save.yourList": "a sua lista",
  "saved.emptyBody":
    "Toque no marcador na página de um produto para o guardar aqui.",
  "saved.emptyTitle": "Ainda nada guardado.",
  "saved.eyebrow": "A sua lista, para mais tarde",
  "saved.intro":
    "Esta lista só é visível para si. Os guardados mais recentemente aparecem primeiro.",
  "saved.metaTitle": "Produtos guardados · VeganAlts",
  "saved.older": "Guardados há mais tempo",
  "saved.pages": "Páginas de produtos guardados",
  "saved.title": "Produtos guardados",
  "search.closestRank": "Mais parecido n.º {rank} para “{food}”",
  "search.emptyBody":
    "Verifique a grafia ou sugira-o como novo alimento para que outras pessoas adicionem produtos.",
  "search.foodOrBrand": "Pesquise um alimento ou marca",
  "search.includesFlavors": "A pontuação inclui os sabores desta receita",
  "search.loadFailed":
    "Não foi possível carregar as sugestões. Prima Enter para pesquisar.",
  "search.loading": "A carregar sugestões…",
  "search.needMore":
    "Introduza pelo menos 3 letras ou números para ver sugestões.",
  "search.needThree": "Introduza pelo menos 3 letras ou números.",
  "search.placeholder": "Carne picada, cheddar, ovos…",
  "search.submit": "Pesquisar alternativas",
  "search.unavailable":
    "As sugestões não estão disponíveis neste momento. Prima Enter para pesquisar.",
  "searchPage.checkSpelling":
    "Verifique a grafia ou tente um alimento mais geral, como carne, queijo ou leite.",
  "searchPage.enterThree": "Introduza pelo menos 3 letras ou números",
  "searchPage.metaTitleQuery": "Pesquisa por {query}",
  "searchPage.title": "Pesquise em todos os alimentos",
  "seeMore.limit":
    "Chegou ao limite de navegação. Refine a pesquisa ou os filtros para encontrar mais.",
  "seeMore.loading": "A carregar…",
  "seeMore.offline":
    "Não foi possível carregar mais resultados. Verifique a sua ligação e tente de novo.",
  "select.searchFailed":
    "Não foi possível carregar a pesquisa. Edite a pesquisa para tentar de novo.",
  "signIn.continueBrowsing": "Continuar a navegar →",
  "signIn.couldNotStart": "Não foi possível iniciar a sessão. Tente novamente.",
  "signIn.didNotFinish":
    "O início de sessão não foi concluído. Tente novamente.",
  "signIn.eyebrow": "A sua experiência faz a diferença",
  "signIn.intro":
    "Acompanhe o que já experimentou e ajude outras pessoas a encontrar uma alternativa mais parecida. Se acabou de atribuir uma pontuação ou guardar um produto, vamos manter isso para quando voltar.",
  "signIn.metaTitle": "Iniciar sessão · VeganAlts",
  "signIn.optionsLabel": "Opções para iniciar sessão",
  "signIn.preparing":
    "O início de sessão está a ser preparado. Volte em breve.",
  "signIn.termsAfter": ". Veja como tratamos os seus dados no",
  "signIn.termsBefore": "Ao continuar, concorda com os",
  "signIn.title": "Iniciar sessão no VeganAlts",
  "signIn.unavailable":
    "Esta opção de início de sessão ainda não está disponível.",
  "status.unchecked": "Ingredientes ainda não verificados",
  "suggestFood.intro":
    "Um alimento é o produto convencional que as pessoas querem substituir, como “Folhado de salsicha” ou “Queijo creme”. Tem o seu próprio ranking. Abre primeiro neste país ({country}); os outros países recebem-no quando alguém adiciona lá um produto.",
  "suggestFood.productAfter": "e os dois são revistos em conjunto.",
  "suggestFood.productLink": "Adicione-o com o produto",
  "suggestFood.reviewBefore":
    "Verificamos se há duplicados e decidimos no prazo máximo de três dias. Acompanhe na página",
  "summary.empty":
    "Ainda não há alternativas veganas classificadas para “{food}”. Já experimentou alguma? A sua avaliação inicia o ranking.",
  "summary.emptyTastiest":
    "Ninguém disse ainda se estas alternativas para “{food}” são saborosas. Já experimentou alguma? A sua resposta inicia o ranking.",
};

export const portugalErrors: Record<string, string> = {
  "A category cannot be placed beneath itself.":
    "Uma categoria não pode ser colocada dentro de si própria.",
  "A category changed. Refresh before merging.":
    "Uma categoria mudou. Atualize a página antes de fundir.",
  "A chosen category is no longer active. Refresh and choose again.":
    "Uma categoria escolhida já não está ativa. Atualize a página e escolha de novo.",
  "A later catalog change overlaps this action. Review the newer changes before reversing it.":
    "Uma alteração posterior do catálogo sobrepõe-se a esta ação. Reveja as alterações mais recentes antes de a desfazer.",
  "A moderator has hidden this comment, so it can't be edited.":
    "Um moderador ocultou este comentário, por isso não pode ser editado.",
  "A previously featured food is no longer on in this country. Switch it on there or choose new features.":
    "Um alimento que estava em destaque já não está ativado neste país. Ative-o aqui ou escolha novos destaques.",
  "A product is waiting on this food, so accept it as a ranked food or reject it.":
    "Um produto está à espera deste alimento. Aceite-o como alimento classificado ou rejeite-o.",
  "A request body is required.": "O corpo do pedido é obrigatório.",
  "Aisles take no aliases or search terms. Add them to a food.":
    "As categorias não aceitam outros nomes nem termos de pesquisa. Adicione-os a um alimento.",
  "Another contributor just published this product. Search for its canonical entry.":
    "Outro colaborador acabou de publicar este produto. Procure a respetiva página principal.",
  "Another merge involving these categories is in progress.":
    "Está em curso outra fusão que envolve estas categorias.",
  "Another request is continuing this merge. Refresh shortly.":
    "Outro pedido está a continuar esta fusão. Atualize a página dentro de instantes.",
  "Another request is finalizing this merge.":
    "Outro pedido está a finalizar esta fusão.",
  "Another request is reversing this merge.":
    "Outro pedido está a desfazer esta fusão.",
  "Archived products cannot change lines.":
    "Os produtos arquivados não podem mudar de gama.",
  "Both categories must be active.": "As duas categorias têm de estar ativas.",
  "Choose a line of this brand in this country.":
    "Escolha uma gama desta marca neste país.",
  "Choose a valid results section.": "Escolha uma secção de resultados válida.",
  "Choose a whole-number score from 1 to 5 for a valid formula and category.":
    "Escolha uma pontuação inteira de 1 a 5 para uma fórmula e uma categoria válidas.",
  "Choose a whole-number score from 1 to 5.":
    "Escolha uma pontuação inteira de 1 a 5.",
  "Choose allergens from this country’s list.":
    "Escolha alergénios da lista deste país.",
  "Choose an active country for this retailer.":
    "Escolha um país ativo para este retalhista.",
  "Choose an active retailer in this product's country.":
    "Escolha um retalhista ativo no país deste produto.",
  "Choose an image no larger than 10 MiB.":
    "Escolha uma imagem com um máximo de 10 MiB.",
  "Choose an image with at most 40 megapixels.":
    "Escolha uma imagem com um máximo de 40 megapixels.",
  "Choose one of the brand’s lines, or name a new one.":
    "Escolha uma das gamas da marca ou dê nome a uma nova.",
  "Cite this formula’s accepted ingredients or nutrition photo.":
    "Cite a foto de ingredientes ou da tabela nutricional aceite desta fórmula.",
  "Companion and successor products must belong to this country.":
    "Os produtos complementares e sucessores têm de pertencer a este país.",
  "Finish every photo upload before submitting.":
    "Conclua o carregamento de todas as fotos antes de enviar.",
  "Finish the evidence uploads for this product before submitting.":
    "Conclua o carregamento das evidências deste produto antes de enviar.",
  "Finish the merge involving this category first.":
    "Conclua primeiro a fusão que envolve esta categoria.",
  "Finish the merge involving this food first.":
    "Conclua primeiro a fusão que envolve este alimento.",
  "Finish uploading the photos before submitting.":
    "Termine o carregamento das fotos antes de enviar o formulário.",
  "Merge not found.": "Fusão não encontrada.",
  "Merge rankable categories only into rankable categories.":
    "Funda categorias classificáveis apenas com categorias classificáveis.",
  "No relationship exists for that retailer.":
    "Não existe relação com esse retalhista.",
  "Only a completed active merge can be reversed.":
    "Só é possível desfazer uma fusão ativa e concluída.",
  "Only an accepted submission takes a reviewed classification.":
    "Apenas um envio aceite recebe uma classificação revista.",
  "Only raster images are accepted.": "Apenas são aceites imagens raster.",
  "Please choose another handle or display name. If this seems incorrect, contact us to appeal.":
    "Escolha outro nome de utilizador ou outro nome a apresentar. Se lhe parecer um engano, contacte-nos para contestar.",
  "Please wait a minute before uploading again.":
    "Aguarde um minuto antes de carregar de novo.",
  "Refresh the current product before changing its line.":
    "Atualize o produto atual antes de mudar a respetiva gama.",
  "Remove your ratings before removing Tried state.":
    "Remova as suas avaliações antes de remover o estado “Já experimentei”.",
  "Reverse the later merge involving these categories first.":
    "Desfaça primeiro a fusão posterior que envolve estas categorias.",
  "Reverse the later merge involving this category first.":
    "Desfaça primeiro a fusão posterior que envolve esta categoria.",
  "Review the current product before applying this catalog decision.":
    "Reveja o produto atual antes de aplicar esta decisão sobre o catálogo.",
  "Review the current product before applying this change.":
    "Reveja o produto atual antes de aplicar esta alteração.",
  "Send an application/json request.": "Envie um pedido application/json.",
  "Sign in to continue.": "Inicie sessão para continuar.",
  "Sign-in is being prepared. Please try again later.":
    "O início de sessão está a ser preparado. Tente novamente mais tarde.",
  "Suggesting a food is unavailable right now. Choose an existing food.":
    "Neste momento, não é possível sugerir um alimento. Escolha um alimento existente.",
  "That category is retired or no longer ranked. Reject this proposal instead.":
    "Essa categoria foi desativada ou já não é classificada. Rejeite esta proposta.",
  "That country is no longer active.": "Esse país já não está ativo.",
  "That handle is already in use.": "Esse nome de utilizador já está em uso.",
  "The catalog facts this proposal relies on changed after it was drafted. Request a fresh proposal.":
    "As informações do catálogo em que esta proposta se baseia mudaram depois de a proposta ter sido redigida. Peça uma nova proposta.",
  "The file could not be decoded as a supported image.":
    "Não foi possível ler o ficheiro como uma imagem compatível.",
  "The line already has this name.": "A gama já tem este nome.",
  "The operator's request changed. Reopen your contribution before responding.":
    "O pedido da equipa mudou. Reabra a sua contribuição antes de responder.",
  "The photo could not be processed. Retry with the same request.":
    "Não foi possível processar a foto. Tente de novo com o mesmo pedido.",
  "The product changed while you were reviewing. Refresh before deciding.":
    "O produto mudou enquanto estava a rever. Atualize a página antes de decidir.",
  "The product changed. Review its current details before proposing this change.":
    "O produto mudou. Reveja os detalhes atuais do produto antes de propor esta alteração.",
  "The product is already in this line.": "O produto já está nesta gama.",
  "The query is too long.": "A pesquisa é demasiado longa.",
  "The request is too large.": "O pedido é demasiado grande.",
  "The staged evidence is unavailable. Please submit it again.":
    "A evidência carregada já não está disponível. Envie-a de novo.",
  "The staged evidence is unavailable. Please upload it again.":
    "A evidência carregada já não está disponível. Carregue-a de novo.",
  "The submitted form is too large.":
    "O formulário enviado é demasiado grande.",
  "These photos are already attached to another proposal or expired. Upload them again for this proposal.":
    "Estas fotos já estão anexadas a outra proposta ou expiraram. Carregue-as de novo para esta proposta.",
  "These questions changed since this action. Review the newer change first.":
    "Estas perguntas mudaram desde esta ação. Reveja primeiro a alteração mais recente.",
  "This category changed after the action. Review the newer change first.":
    "Esta categoria mudou depois da ação. Reveja primeiro a alteração mais recente.",
  "This comment changed after the decision. Review it before reversing.":
    "Este comentário mudou depois da decisão. Reveja-o antes de desfazer.",
  "This content is no longer available for reporting.":
    "Este conteúdo já não está disponível para denúncia.",
  "This decision can no longer be undone here.":
    "Esta decisão já não pode ser desfeita aqui.",
  "This food changed. Refresh before choosing its countries.":
    "Este alimento mudou. Atualize a página antes de escolher os respetivos países.",
  "This food changed. Refresh before editing its questions.":
    "Este alimento mudou. Atualize a página antes de editar as respetivas perguntas.",
  "This food has products, so it stays a food.":
    "Este alimento tem produtos, por isso continua a ser um alimento.",
  "This food has products. Merge it into another food in Taxonomy.":
    "Este alimento tem produtos. Funda-o com outro alimento em Taxonomia.",
  "This food is now an aisle. Reverse that change first.":
    "Este alimento é agora uma categoria. Desfaça essa alteração primeiro.",
  "This food now has products in a country the action added, so it stays on there.":
    "Este alimento tem agora produtos num país que a ação adicionou, por isso continua ativado aí.",
  "This food's countries changed since this action. Review the newer change first.":
    "Os países deste alimento mudaram desde esta ação. Reveja primeiro a alteração mais recente.",
  "This formula already has this allergen declaration.":
    "Esta fórmula já tem esta declaração de alergénio.",
  "This formula and category cannot currently be rated.":
    "Esta fórmula e esta categoria não podem ser avaliadas de momento.",
  "This formula link is invalid.": "A ligação desta fórmula é inválida.",
  "This idempotency key was used for a different upload.":
    "Esta chave de idempotência foi usada noutro carregamento.",
  "This inbox page link is invalid.":
    "A ligação desta página da caixa de entrada é inválida.",
  "This name or alias already belongs to a retailer here. Choose the existing entry.":
    "Este nome ou outro nome já pertence a um retalhista aqui. Escolha o registo existente.",
  "This page link is invalid.": "A ligação desta página é inválida.",
  "This photo slot is already reserved, or the submission/account has reached its image or daily byte allowance. Retry tomorrow for daily limits; use a fresh submission to change a reserved photo.":
    "Este espaço de foto já está reservado, ou o envio ou a conta atingiu o limite de imagens ou de bytes por dia. Tente de novo amanhã se for o limite diário. Para trocar uma foto reservada, faça um novo envio.",
  "This product already exists. Use the canonical entry.":
    "Este produto já existe. Use a respetiva página principal.",
  "This product has no line.": "Este produto não tem gama.",
  "This product has no relationship with that retailer.":
    "Este produto não tem relação com esse retalhista.",
  "This product is being updated. Please try again.":
    "Este produto está a ser atualizado. Tente de novo.",
  "This product is no longer available.":
    "Este produto já não está disponível.",
  "This record changed. Refresh the review before deciding.":
    "Este registo mudou. Atualize a revisão antes de decidir.",
  "This request cannot use public caching.":
    "Este pedido não pode usar cache público.",
  "This request key belongs to different content.":
    "Esta chave de pedido pertence a outro conteúdo.",
  "This request key belongs to different content. Refresh and try again.":
    "Esta chave de pedido pertence a outro conteúdo. Atualize a página e tente de novo.",
  "This request key belongs to different details.":
    "Esta chave de pedido pertence a outros detalhes.",
  "This request key was used for different details. Start a new submission.":
    "Esta chave de pedido foi usada com outros detalhes. Inicie um novo envio.",
  "This slot already has a photo. Explain why the new photo is better.":
    "Este espaço já tem uma foto. Explique porque é que a nova foto é melhor.",
  "This submission changed or is already being finalized. Refresh its status.":
    "Este envio mudou ou já está a ser finalizado. Atualize o respetivo estado.",
  "This submission changed. Refresh its status.":
    "Este envio mudou. Atualize o respetivo estado.",
  "This submission has already been decided or is being published.":
    "Este envio já foi decidido ou está a ser publicado.",
  "This submission has expired or is already being finalized.":
    "Este envio expirou ou já está a ser finalizado.",
  "This submission is no longer awaiting your response. Refresh its status.":
    "Este envio já não está à espera da sua resposta. Atualize o respetivo estado.",
  "This submission no longer accepts uploads.":
    "Este envio já não aceita carregamentos.",
  "This upload is processing or its allowance is exhausted. Retry later using the same request.":
    "Este carregamento está a ser processado ou o limite foi atingido. Tente de novo mais tarde com o mesmo pedido.",
  "This upload is processing, has reached its retry limit, or today's upload allowance is exhausted. Try again later with the same key.":
    "Este carregamento está a ser processado, atingiu o limite de tentativas ou o limite de carregamentos de hoje foi atingido. Tente de novo mais tarde com a mesma chave.",
  "This upload key belongs to different content.":
    "Esta chave de carregamento pertence a outro conteúdo.",
  "Use 3–30 letters, numbers or underscores, starting with a letter. This handle must not be reserved.":
    "Use de 3 a 30 letras, números ou sublinhados, a começar por uma letra. O nome de utilizador não pode ser reservado.",
  "Use PUT to save a rating.": "Use PUT para guardar uma avaliação.",
  "Use a display name of up to 60 characters.":
    "Use um nome a apresentar com um máximo de 60 caracteres.",
  "Votes are changing quickly. Please retry.":
    "Os votos estão a mudar rapidamente. Tente de novo.",
  "Wait for this upload to finish.": "Aguarde a conclusão deste carregamento.",
  "You already posted this comment on this product.":
    "Já publicou este comentário neste produto.",
  "You can't vote on your own comment.":
    "Não pode votar no seu próprio comentário.",
  "Your name could not be checked. Please try again later.":
    "Não foi possível verificar o seu nome. Tente de novo mais tarde.",
  "Your profile could not be created. Please try again.":
    "Não foi possível criar o seu perfil. Tente de novo.",
  "You’ve suggested the most foods allowed today. Try again tomorrow, or choose an existing food.":
    "Já sugeriu o máximo de alimentos permitido hoje. Tente de novo amanhã ou escolha um alimento existente.",
  "You’ve suggested the most foods allowed today. Try again tomorrow.":
    "Já sugeriu o máximo de alimentos permitido hoje. Tente de novo amanhã.",
};
