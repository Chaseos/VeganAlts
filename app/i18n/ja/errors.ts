// Server errors by their English text; see `serverMessage`.
export const errors: Record<string, string> = {
  "A category cannot be placed beneath itself.":
    "カテゴリーを自身の下に置くことはできません。",
  "A category changed. Refresh before merging.":
    "カテゴリーが変更されました。統合する前に更新してください。",
  "A chosen category is no longer active. Refresh and choose again.":
    "選択したカテゴリーは有効ではなくなりました。更新してから選び直してください。",
  "A later catalog change overlaps this action. Review the newer changes before reversing it.":
    "この操作より後のカタログ変更と重なっています。元に戻す前に、新しい変更を確認してください。",
  "A moderator has hidden this comment, so it can't be edited.":
    "モデレーターがこのコメントを非表示にしたため、編集できません。",
  "A newer response replaced this check.":
    "より新しい応答によって、このチェックは置き換えられました。",
  "A previously featured category was retired. Choose new features instead.":
    "以前に特集されていたカテゴリーは廃止されました。代わりに新しい特集を選んでください。",
  "A previously featured food is no longer on in this country. Switch it on there or choose new features.":
    "以前に特集されていた食品は、この国ではオンではなくなりました。この国でオンに切り替えるか、新しい特集を選んでください。",
  "A product is waiting on this food, so accept it as a ranked food or reject it.":
    "この食品を待っている商品があります。ランキング対象の食品として承認するか、却下してください。",
  "A request body is required.": "リクエスト本文が必要です。",
  "Administrator access is required.": "管理者権限が必要です。",
  "Aisle not found.": "カテゴリーが見つかりません。",
  "Aisles appear in every country. Choose countries for a food.":
    "カテゴリーはすべての国に表示されます。国は食品ごとに選んでください。",
  "Aisles take no aliases or search terms. Add them to a food.":
    "カテゴリーには別名や検索語を設定できません。食品に追加してください。",
  "Aliases belong to foods, not aisles.":
    "別名はカテゴリーではなく食品に設定します。",
  "Another category uses or redirects from that address.":
    "別のカテゴリーがそのアドレスを使用しているか、そのアドレスから転送されています。",
  "Another contributor just published this product. Search for its canonical entry.":
    "別の投稿者がこの商品をたった今公開しました。正規の登録を検索してください。",
  "Another merge involving these categories is in progress.":
    "これらのカテゴリーに関わる別の統合が進行中です。",
  "Another product already uses this brand and name.":
    "別の商品ですでにこのブランドと名前が使われています。",
  "Another request is continuing this merge. Refresh shortly.":
    "別のリクエストがこの統合を続行しています。しばらくしてから更新してください。",
  "Another request is finalizing this merge.":
    "別のリクエストがこの統合を確定しています。",
  "Another request is reversing this merge.":
    "別のリクエストがこの統合を元に戻しています。",
  "Archived products cannot change lines.":
    "アーカイブ済みの商品は、シリーズを変更できません。",
  "Archived products cannot receive catalog changes.":
    "アーカイブ済みの商品には、カタログの変更を適用できません。",
  "Archived products cannot receive new contributions.":
    "アーカイブ済みの商品は、新しい投稿を受け付けられません。",
  "Attach the updated packaging photos.":
    "更新したパッケージの写真を添付してください。",
  "Both categories must be active.":
    "両方のカテゴリーが有効である必要があります。",
  "Brand not found.": "ブランドが見つかりません。",
  "Category not found.": "カテゴリーが見つかりません。",
  "Change eligibility only for existing product categories.":
    "対象とするかどうかは、既存の商品カテゴリーに対してのみ変更できます。",
  "Choose Closest match, Tastiest, Trending, Newest, Most rated or a detail sort.":
    "「本物に近い順」「おいしい順」「急上昇」「新着順」「評価数順」、または詳細の並べ替えを選んでください。",
  "Choose a JPEG, PNG, or WebP photo.":
    "JPEG、PNG、WebPのいずれかの写真を選んでください。",
  "Choose a closeness answer before adding comparison details.":
    "比較の詳細を追加する前に、近さの回答を選んでください。",
  "Choose a different related product and a relationship.":
    "別の関連商品と、その関係を選んでください。",
  "Choose a line of this brand in this country.":
    "この国にあるこのブランドのシリーズを選んでください。",
  "Choose a page from 1 to 100.": "1から100までのページを選んでください。",
  "Choose a supported image slot.": "対応している画像の枠を選んでください。",
  "Choose a valid JPEG, PNG, or WebP image.":
    "有効なJPEG、PNG、WebPの画像を選んでください。",
  "Choose a valid results section.": "有効な結果のセクションを選んでください。",
  "Choose a whole-number score from 1 to 5 for a valid formula and category.":
    "有効なレシピとカテゴリーに対して、1から5までの整数のスコアを選んでください。",
  "Choose a whole-number score from 1 to 5.":
    "1から5までの整数のスコアを選んでください。",
  "Choose accept, reject, or request follow-up.":
    "承認、却下、追加確認の依頼のいずれかを選んでください。",
  "Choose allergens from this country’s list.":
    "この国のリストからアレルゲンを選んでください。",
  "Choose an active country for each country-specific alias.":
    "国別の別名ごとに、有効な国を選んでください。",
  "Choose an active country for homepage features.":
    "ホームページの特集に使う有効な国を選んでください。",
  "Choose an active country for this retailer.":
    "この販売店の有効な国を選んでください。",
  "Choose an active parent category.": "有効な親カテゴリーを選んでください。",
  "Choose an active rankable food.":
    "ランキング対象の有効な食品を選んでください。",
  "Choose an active replacement category.":
    "置き換え先の有効なカテゴリーを選んでください。",
  "Choose an active retailer in this product's country.":
    "この商品の国にある有効な販売店を選んでください。",
  "Choose an image no larger than 10 MiB.":
    "10 MiB以下の画像を選んでください。",
  "Choose an image with at most 40 megapixels.":
    "40メガピクセル以下の画像を選んでください。",
  "Choose each category once.": "各カテゴリーは1回ずつ選んでください。",
  "Choose evidence belonging to this product.":
    "この商品に属する証拠を選んでください。",
  "Choose exactly one image.": "画像をちょうど1枚選んでください。",
  "Choose foods that are still listed.":
    "引き続き掲載されている食品を選んでください。",
  "Choose one of the brand’s lines, or name a new one.":
    "このブランドのシリーズから選ぶか、新しいシリーズ名を入力してください。",
  "Choose one of the countries VeganAlts is open in.":
    "VeganAltsが展開している国から選んでください。",
  "Choose one of this product's categories.":
    "この商品のカテゴリーから選んでください。",
  "Choose only active countries.": "有効な国のみを選んでください。",
  "Choose resolve, dismiss, or request follow-up.":
    "解決、却下、追加確認の依頼のいずれかを選んでください。",
  "Choose stores from this country's list.":
    "この国のリストから店舗を選んでください。",
  "Choose the aisle the new food belongs in.":
    "新しい食品が属するカテゴリーを選んでください。",
  "Choose the category that receives this name.":
    "この名前を受け取るカテゴリーを選んでください。",
  "Choose two currently visible products.":
    "現在表示されている商品を2つ選んでください。",
  "Choose two different categories.": "異なるカテゴリーを2つ選んでください。",
  "Choose two different products in the same country.":
    "同じ国の異なる商品を2つ選んでください。",
  "Cite this formula’s accepted ingredients or nutrition photo.":
    "このレシピで承認済みの原材料または栄養成分の写真を、根拠として指定してください。",
  "Comment not found.": "コメントが見つかりません。",
  "Companion and successor products must belong to this country.":
    "関連商品と後継商品は、この国の商品である必要があります。",
  "Complete the quick security check, then try again.":
    "簡単なセキュリティ確認を完了してから、もう一度お試しください。",
  "Contribution not found.": "投稿が見つかりません。",
  "Decide category proposals in the taxonomy review.":
    "カテゴリーの提案は、分類の確認画面で判断してください。",
  "Endpoint not found.": "エンドポイントが見つかりません。",
  "Evidence not found.": "証拠が見つかりません。",
  "Feature only foods that are on in this country.":
    "この国でオンになっている食品だけを特集してください。",
  "Finish every photo upload before submitting.":
    "送信する前に、すべての写真のアップロードを完了してください。",
  "Finish the evidence uploads for this product before submitting.":
    "送信する前に、この商品の証拠のアップロードを完了してください。",
  "Finish the merge involving this category first.":
    "先に、このカテゴリーに関わる統合を完了してください。",
  "Finish the merge involving this food first.":
    "先に、この食品に関わる統合を完了してください。",
  "Finish uploading the photos before submitting.":
    "送信する前に、写真のアップロードを完了してください。",
  "Formula not found.": "レシピが見つかりません。",
  "Give each active question its own label.":
    "有効な質問ごとに、それぞれ別のラベルを付けてください。",
  "Give this aisle an English name first.":
    "先に、このカテゴリーに英語名を付けてください。",
  "Homepage features changed since this action.":
    "この操作の後に、ホームページの特集が変更されました。",
  "Invalid catalog change.": "カタログの変更が無効です。",
  "Invalid formula ID.": "レシピIDが無効です。",
  "Merge not found.": "統合が見つかりません。",
  "Merge rankable categories only into rankable categories.":
    "ランキング対象のカテゴリーは、ランキング対象のカテゴリーにのみ統合できます。",
  "No relationship exists for that retailer.":
    "その販売店との関係は存在しません。",
  "Nothing changed.": "変更はありませんでした。",
  "Only a completed active merge can be reversed.":
    "完了済みの有効な統合のみ、元に戻せます。",
  "Only active foods ask detail questions.":
    "詳細の質問をするのは、有効な食品のみです。",
  "Only an accepted submission takes a reviewed classification.":
    "承認済みの投稿のみ、確認済みの分類を受け付けます。",
  "Only discontinued products can be reintroduced.":
    "販売終了した商品のみ、販売再開できます。",
  "Only raster images are accepted.": "ラスター画像のみ受け付けます。",
  "Please choose another handle or display name. If this seems incorrect, contact us to appeal.":
    "別のハンドル名または表示名を選んでください。誤りだと思われる場合は、ご連絡のうえ異議をお申し立てください。",
  "Please wait a minute before trying again.":
    "1分ほど待ってから、もう一度お試しください。",
  "Please wait a minute before uploading again.":
    "1分ほど待ってから、もう一度アップロードしてください。",
  "Processing expired. Please retry with the same key.":
    "処理の有効期限が切れました。同じキーでもう一度お試しください。",
  "Processing expired. Please retry.":
    "処理の有効期限が切れました。もう一度お試しください。",
  "Product not found.": "商品が見つかりません。",
  "Product or formula not found.": "商品またはレシピが見つかりません。",
  "Product removal requires a report that the product does not belong on VeganAlts.":
    "商品を削除するには、その商品がVeganAltsに掲載すべきでないという報告が必要です。",
  "Profile not found.": "プロフィールが見つかりません。",
  "Proposal decisions do not support this effect.":
    "提案の判断は、この効果に対応していません。",
  "Proposal not found.": "提案が見つかりません。",
  "Publication expired. Refresh and retry.":
    "公開の有効期限が切れました。更新してからもう一度お試しください。",
  "Publish or hide the held comment.":
    "保留中のコメントを公開するか、非表示にしてください。",
  "Questions are never removed. Retire one instead.":
    "質問は削除できません。代わりに廃止してください。",
  "Rating not found.": "評価が見つかりません。",
  "Refresh the current product before changing its line.":
    "シリーズを変更する前に、現在の商品を更新してください。",
  "Refresh the current product before reversing this action.":
    "この操作を元に戻す前に、現在の商品を更新してください。",
  "Refresh the results and try again.":
    "結果を更新してから、もう一度お試しください。",
  "Refresh this page before making changes.":
    "変更する前に、このページを更新してください。",
  "Remove your ratings before removing Tried state.":
    "「試した」状態を外す前に、ご自身の評価を削除してください。",
  "Report not found.": "報告が見つかりません。",
  "Request up to 40 valid formula IDs.":
    "有効なレシピIDは40件までリクエストできます。",
  "Reverse the later edits to these categories first.":
    "先に、これらのカテゴリーへの後の編集を元に戻してください。",
  "Reverse the later merge involving these categories first.":
    "先に、これらのカテゴリーに関わる後の統合を元に戻してください。",
  "Reverse the later merge involving this category first.":
    "先に、このカテゴリーに関わる後の統合を元に戻してください。",
  "Review the current product before applying this catalog decision.":
    "このカタログの判断を適用する前に、現在の商品を確認してください。",
  "Review the current product before applying this change.":
    "この変更を適用する前に、現在の商品を確認してください。",
  "Select a valid photo report to remove a photo.":
    "写真を削除するには、有効な写真の報告を選択してください。",
  "Select a visible reported comment to hide it.":
    "非表示にするには、表示中の報告されたコメントを選択してください。",
  "Send a valid JSON body.": "有効なJSON本文を送信してください。",
  "Send a valid form.": "有効なフォームを送信してください。",
  "Send an application/json request.":
    "application/jsonのリクエストを送信してください。",
  "Sign in to continue.": "続けるにはログインしてください。",
  "Sign-in is being prepared. Please try again later.":
    "ログインは準備中です。しばらくしてからもう一度お試しください。",
  "Submission decisions do not support this effect.":
    "投稿の判断は、この効果に対応していません。",
  "Submission not found.": "投稿が見つかりません。",
  "Suggesting a food is unavailable right now. Choose an existing food.":
    "現在、食品の提案はご利用いただけません。既存の食品を選んでください。",
  "That address is reserved. Choose another name or slug.":
    "そのアドレスは予約されています。別の名前またはスラッグを選んでください。",
  "That category is retired or no longer ranked. Reject this proposal instead.":
    "そのカテゴリーは廃止されたか、ランキング対象ではなくなりました。代わりにこの提案を却下してください。",
  "That country is no longer active.": "その国は有効ではなくなりました。",
  "That handle is already in use.": "そのハンドル名はすでに使われています。",
  "The automatic check could not finish. Please try again later.":
    "自動チェックを完了できませんでした。しばらくしてからもう一度お試しください。",
  "The catalog facts this proposal relies on changed after it was drafted. Request a fresh proposal.":
    "この提案の前提となるカタログの情報が、作成後に変更されました。新しい提案をリクエストしてください。",
  "The file could not be decoded as a supported image.":
    "このファイルは、対応している画像として読み取れませんでした。",
  "The image could not be decoded.": "画像を読み取れませんでした。",
  "The image could not be processed. Retry using the same key.":
    "画像を処理できませんでした。同じキーでもう一度お試しください。",
  "The line already has this name.":
    "このシリーズにはすでにこの名前が付いています。",
  "The operator's request changed. Reopen your contribution before responding.":
    "運営のリクエストが変更されました。返信する前に、ご自身の投稿を開き直してください。",
  "The photo could not be processed. Retry with the same request.":
    "写真を処理できませんでした。同じリクエストでもう一度お試しください。",
  "The product already has this brand.":
    "この商品にはすでにこのブランドが設定されています。",
  "The product already has this name and flavor.":
    "この商品にはすでにこの名前とフレーバーが設定されています。",
  "The product changed while you were reviewing. Refresh before deciding.":
    "確認している間に商品が変更されました。判断する前に更新してください。",
  "The product changed. Refresh before confirming availability.":
    "商品が変更されました。取り扱いを確認する前に更新してください。",
  "The product changed. Review its current details before proposing this change.":
    "商品が変更されました。この変更を提案する前に、現在の詳細を確認してください。",
  "The product is already in this category.":
    "この商品はすでにこのカテゴリーに入っています。",
  "The product is already in this line.":
    "この商品はすでにこのシリーズに入っています。",
  "The product is already listed under these foods.":
    "この商品はすでにこれらの食品として掲載されています。",
  "The proposal changed. Refresh before deciding.":
    "提案が変更されました。判断する前に更新してください。",
  "The query is too long.": "検索語が長すぎます。",
  "The report has new evidence. Refresh before deciding.":
    "報告に新しい根拠資料が追加されました。判断する前に更新してください。",
  "The request is too large.": "リクエストが大きすぎます。",
  "The security check did not respond. Please retry.":
    "セキュリティ確認から応答がありませんでした。もう一度お試しください。",
  "The security check expired. Please complete it again.":
    "セキュリティ確認の有効期限が切れました。もう一度完了してください。",
  "The security check is unavailable. Wait a minute and try again.":
    "セキュリティ確認をご利用いただけません。1分ほど待ってから、もう一度お試しください。",
  "The staged evidence is unavailable. Please submit it again.":
    "一時保存された証拠を利用できません。もう一度送信してください。",
  "The staged evidence is unavailable. Please upload it again.":
    "一時保存された証拠を利用できません。もう一度アップロードしてください。",
  "The submitted form is empty.": "送信されたフォームが空です。",
  "The submitted form is too large.": "送信されたフォームが大きすぎます。",
  "The survivor cannot sit beneath the duplicate.":
    "残す側を、重複側の下に置くことはできません。",
  "These details differ from the checked submission. Start a fresh check.":
    "これらの詳細は、チェック済みの投稿と異なります。新しくチェックを始めてください。",
  "These photos are already attached to another proposal or expired. Upload them again for this proposal.":
    "これらの写真はすでに別の提案に添付されているか、有効期限が切れています。この提案用にもう一度アップロードしてください。",
  "These questions changed since this action. Review the newer change first.":
    "この操作の後に、これらの質問が変更されました。先に新しい変更を確認してください。",
  "These results have changed. Please retry.":
    "結果が変更されました。もう一度お試しください。",
  "These results have changed. Refresh the results and try again.":
    "結果が変更されました。結果を更新してから、もう一度お試しください。",
  "This account cannot make changes.": "このアカウントでは変更できません。",
  "This action did not change the catalog.":
    "この操作ではカタログは変更されませんでした。",
  "This action has no reversible catalog changes.":
    "この操作には、元に戻せるカタログの変更がありません。",
  "This automatic check was replaced or expired. Please resubmit.":
    "この自動チェックは置き換えられたか、有効期限が切れました。もう一度送信してください。",
  "This category changed after the action. Review the newer change first.":
    "この操作の後にこのカテゴリーが変更されました。先に新しい変更を確認してください。",
  "This category changed. Refresh before editing.":
    "このカテゴリーが変更されました。編集する前に更新してください。",
  "This comment changed after the decision. Review it before reversing.":
    "判断の後にこのコメントが変更されました。元に戻す前に確認してください。",
  "This comment changed. Refresh before deciding.":
    "このコメントが変更されました。判断する前に更新してください。",
  "This comment changed. Refresh before editing.":
    "このコメントが変更されました。編集する前に更新してください。",
  "This comment changed. Reload the page before hiding it.":
    "このコメントが変更されました。非表示にする前にページを再読み込みしてください。",
  "This content is no longer available for reporting.":
    "このコンテンツは、もう報告できません。",
  "This content is unavailable.": "このコンテンツは利用できません。",
  "This contribution was rejected. Revise it before submitting again.":
    "この投稿は却下されました。修正してから、もう一度送信してください。",
  "This country is not available for contributions.":
    "この国では投稿を受け付けていません。",
  "This country is not available.": "この国はご利用いただけません。",
  "This decision can no longer be undone here.":
    "この判断は、ここではもう取り消せません。",
  "This evidence expired or is being reviewed. Refresh before retrying.":
    "この証拠は有効期限が切れたか、確認中です。再試行する前に更新してください。",
  "This food changed. Refresh before choosing its countries.":
    "この食品が変更されました。国を選ぶ前に更新してください。",
  "This food changed. Refresh before editing its questions.":
    "この食品が変更されました。質問を編集する前に更新してください。",
  "This food doesn’t ask that detail question.":
    "この食品では、その詳細の質問は行っていません。",
  "This food has products, so it stays a food.":
    "この食品には商品があるため、食品のままとなります。",
  "This food has products. Merge it into another food in Taxonomy.":
    "この食品には商品があります。分類で別の食品に統合してください。",
  "This food is now an aisle. Reverse that change first.":
    "この食品は現在カテゴリーになっています。先にその変更を元に戻してください。",
  "This food is unavailable.": "この食品は利用できません。",
  "This food now has products in a country the action added, so it stays on there.":
    "この食品には、この操作で追加された国に商品があるため、その国ではオンのままとなります。",
  "This food's countries changed since this action. Review the newer change first.":
    "この操作の後に、この食品の国が変更されました。先に新しい変更を確認してください。",
  "This food’s detail questions changed. Refresh to see the current ones.":
    "この食品の詳細の質問が変更されました。最新の質問を見るには更新してください。",
  "This formula already has this allergen declaration.":
    "このレシピにはすでにこのアレルゲン表示が設定されています。",
  "This formula and category cannot currently be rated.":
    "現在、このレシピとカテゴリーは評価できません。",
  "This formula link is invalid.": "このレシピのリンクが無効です。",
  "This idempotency key was used for a different upload.":
    "この冪等性キーは、別のアップロードに使われました。",
  "This inbox page link is invalid.":
    "この受信トレイのページリンクが無効です。",
  "This is already the manufacturer source.":
    "これはすでにメーカーの情報源です。",
  "This name already finds the product.":
    "この名前ですでにこの商品が見つかります。",
  "This name or alias already belongs to a retailer here. Choose the existing entry.":
    "この名前または別名は、この国のある販売店ですでに使われています。既存の登録を選んでください。",
  "This page is not available.": "このページは利用できません。",
  "This page link is invalid.": "このページのリンクが無効です。",
  "This photo slot is already reserved, or the submission/account has reached its image or daily byte allowance. Retry tomorrow for daily limits; use a fresh submission to change a reserved photo.":
    "この写真の枠はすでに予約されているか、投稿またはアカウントが画像数または1日のバイト数の上限に達しています。1日の上限の場合は明日もう一度お試しください。予約済みの写真を変更するには、新しい投稿を使ってください。",
  "This product already exists. Use the canonical entry.":
    "この商品はすでに存在します。正規の登録を使ってください。",
  "This product has no line.": "この商品にはシリーズがありません。",
  "This product has no relationship with that retailer.":
    "この商品とその販売店との関係はありません。",
  "This product is already discontinued.":
    "この商品はすでに販売終了しています。",
  "This product is being updated. Please try again.":
    "この商品は更新中です。もう一度お試しください。",
  "This product is no longer available.":
    "この商品はすでに利用できなくなっています。",
  "This product is not available for contributions.":
    "この商品では投稿を受け付けていません。",
  "This product isn’t ranked for that food.":
    "この商品は、その食品ではランキングされていません。",
  "This proposal changed. Refresh before deciding.":
    "この提案が変更されました。判断する前に更新してください。",
  "This proposal has already been decided.": "この提案はすでに判断済みです。",
  "This proposal is closed, or it is your own proposal.":
    "この提案は終了したか、ご自身の提案です。",
  "This record changed. Refresh the review before deciding.":
    "この記録が変更されました。判断する前に、確認画面を更新してください。",
  "This report changed. Refresh before deciding.":
    "この報告が変更されました。判断する前に更新してください。",
  "This request cannot use public caching.":
    "このリクエストでは公開キャッシュを使えません。",
  "This request key belongs to different content.":
    "このリクエストキーは、別の内容に属しています。",
  "This request key belongs to different content. Refresh and try again.":
    "このリクエストキーは、別の内容に属しています。更新してから、もう一度お試しください。",
  "This request key belongs to different details.":
    "このリクエストキーは、別の詳細に属しています。",
  "This request key was used for different details. Start a new submission.":
    "このリクエストキーは、別の詳細に使われました。新しく投稿を始めてください。",
  "This slot already has a photo. Explain why the new photo is better.":
    "この枠にはすでに写真があります。新しい写真のほうが良い理由を説明してください。",
  "This submission changed or is already being finalized. Refresh its status.":
    "この投稿は変更されたか、すでに確定処理中です。ステータスを更新してください。",
  "This submission changed. Refresh its status.":
    "この投稿が変更されました。ステータスを更新してください。",
  "This submission has already been decided or is being published.":
    "この投稿はすでに判断済みか、公開処理中です。",
  "This submission has expired or is already being finalized.":
    "この投稿は有効期限が切れたか、すでに確定処理中です。",
  "This submission is no longer awaiting your response. Refresh its status.":
    "この投稿は、もうあなたの返信を待っていません。ステータスを更新してください。",
  "This submission no longer accepts uploads.":
    "この投稿では、もうアップロードを受け付けていません。",
  "This suggestion changed. Refresh before deciding.":
    "この提案が変更されました。判断する前に更新してください。",
  "This taxonomy action cannot be reversed.":
    "この分類の操作は元に戻せません。",
  "This upload is processing or its allowance is exhausted. Retry later using the same request.":
    "このアップロードは処理中か、上限に達しています。同じリクエストで後ほどお試しください。",
  "This upload is processing, has reached its retry limit, or today's upload allowance is exhausted. Try again later with the same key.":
    "このアップロードは処理中か、再試行の上限に達したか、本日のアップロード上限に達しています。同じキーで後ほどもう一度お試しください。",
  "This upload key belongs to different content.":
    "このアップロードキーは、別の内容に属しています。",
  "Today's comment allowance is exhausted, or this formula changed. Refresh and try again tomorrow.":
    "本日のコメント上限に達したか、このレシピが変更されました。更新して、明日もう一度お試しください。",
  "Today's comment allowance is exhausted. Please try again tomorrow.":
    "本日のコメント上限に達しました。明日もう一度お試しください。",
  "Under Review requires an assessed ingredient concern.":
    "「確認中」には、判断済みの原材料に関する懸念が必要です。",
  "Use 2–60 lowercase letters, numbers and hyphens.":
    "英小文字、数字、ハイフンを2〜60文字で入力してください。",
  "Use 3–30 letters, numbers or underscores, starting with a letter. This handle must not be reserved.":
    "英字、数字、アンダースコアを3〜30文字で入力し、先頭は英字にしてください。予約されているハンドル名は使えません。",
  "Use PUT to save a rating.": "評価を保存するにはPUTを使ってください。",
  "Use a display name of up to 60 characters.":
    "表示名は60文字以内で入力してください。",
  "Use a recognizable brand and product name, with more than a package size.":
    "内容量だけでなく、ブランド名と商品名がわかる名前を入力してください。",
  "Use a valid effective date.": "有効な適用日を入力してください。",
  "Use an effective year between 1900 and 2200.":
    "適用年は1900年から2200年の間で入力してください。",
  "Use an idempotency key of 16–100 letters, digits, underscores, or hyphens.":
    "冪等性キーは、英字、数字、アンダースコア、ハイフンの16〜100文字で入力してください。",
  "Use each query parameter only once.":
    "各クエリパラメーターは1回だけ使ってください。",
  "Use each question key once.": "各質問キーは1回だけ使ってください。",
  "Use reintroduction for a discontinued product.":
    "販売終了した商品には、「販売再開の商品」を使ってください。",
  "Votes are changing quickly. Please retry.":
    "投票が短時間で変化しています。もう一度お試しください。",
  "Wait for this upload to finish.":
    "このアップロードが終わるまでお待ちください。",
  "You already posted this comment on this product.":
    "この商品には、すでに同じコメントを投稿しています。",
  "You can't vote on your own comment.": "ご自身のコメントには投票できません。",
  "Your name could not be checked. Please try again later.":
    "名前を確認できませんでした。しばらくしてからもう一度お試しください。",
  "Your profile could not be created. Please try again.":
    "プロフィールを作成できませんでした。もう一度お試しください。",
  "You’ve suggested the most foods allowed today. Try again tomorrow, or choose an existing food.":
    "本日提案できる食品の上限に達しました。明日もう一度お試しいただくか、既存の食品を選んでください。",
  "You’ve suggested the most foods allowed today. Try again tomorrow.":
    "本日提案できる食品の上限に達しました。明日もう一度お試しください。",
};
