## Findings (hand-written, verified live)

1. **Location strings must carry the country.** `filter.location.query` is fuzzy. A bare `Riyadh` resolved to a
   village near Khartoum, Sudan and returned 0 venues; `Riyadh, Saudi Arabia` resolves to *Riyadh Region* and returns
   data. `Jeddah, Saudi Arabia` resolved to the whole country (`السعودية`), i.e. no usable city-level match. Amman,
   Dubai and Cairo resolve correctly. The planner therefore uses a per-city `qlooQuery` and surfaces the matched
   locality (`query.localities.filter[0].disambiguation`) in the result so a wrong match is visible.
2. **Riyadh and Cairo resolve to a region/governorate**, so venues can be far apart; the planner reports the
   locality it matched rather than claiming a neighbourhood.
3. **Arabic names are rare.** Most venues come back with Latin-script names (0-22 % contain Arabic, Cairo highest,
   Dubai none). Names of the form `English | عربي` are split into `nameEn`/`nameAr`; otherwise the Arabic UI shows the
   Latin name and translates everything else (cuisine, setting, activity labels) from our own bilingual tag catalog.
4. **Restaurants carry `price_level` (1-4) for ~84-94 %** of venues, ratings ~100 %, opening hours mostly. This
   is what makes a per-person budget filter possible. **Activities have no `price_level`**, so activity cost uses
   a clearly labelled heuristic table (`ACTIVITIES[].estUsd`) scaled by a city price factor.
5. **Dietary tags exist per venue** (`urn:tag:dietary_option:qloo:*`: halal, vegetarian, vegan, gluten-free), but
   they are a *presence* signal only: absence does not prove a venue cannot serve a need. The planner labels dietary
   evidence as "tagged by Qloo" vs "not confirmed" and never claims certainty (especially for allergies).
6. **Taste signals work everywhere probed**: cuisine tags and an artist entity as `signal.interests.*` gave an
   affinity score for 100 % of results and `feature.explainability` returned per-seed contributions. This is the
   basis for the "why Qloo picked this" text.
7. **Thin categories:** karaoke (0 everywhere), hiking, go-karting, cooking class, adventure sports are sparse
   outside Dubai. The planner falls back to broader categories (sightseeing, parks, museums, spa) when a member's
   preferred activity has no venue.
8. Weighted signals and `signal.interests.entities.query` are POST-only in the hackathon API and are not used
   (the client is GET-only).
