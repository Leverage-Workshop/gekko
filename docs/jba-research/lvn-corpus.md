# Job's LVN / HVN corpus — worked examples from the preps, deep dive, and replays

Mined 2026-08-22 from every file under `docs/jba-research/` for the **vision-based profile
node identification** in the Job planning task (`docs/job-planning-task-plan.md`, section
"Profile node identification (vision)"). This is the **primary** ground truth for that
work: the prompt's criteria are distilled from section B, the few-shot examples and the
golden test set are built from section A (each row = a prep date + a profile + the price
Job named), and section D is the negative set. The `chart-data/lvn-fixtures/` set is the
**backup** (operator-labeled under Gekko-era criteria, not Job's vocabulary).

**Reading notes.** Prep transcripts are single-line files, so prep citations are `file:1`.
Replays and the deep dive are timestamped line-by-line. Auto-captions garble "LVN" as `LBN`,
`VM`, `OBN`, `OVN`, `LV`; "POC" as `PAC`/`pock`/`pocket`; "G line" as `Gline`/`Genie
line`; "MGI" as `NGI`. Garbles are quoted verbatim with the decode noted. ES is always
planned first, then NQ; NQ prices are often spoken without the thousands digit ("the 960s"
= 24960).

## A. The corpus

Format: `source | date | verbatim | profile | price(s) | shape / qualifier | role in plan`

### A1. Prep videos (25 transcripts)

| # | Source | Date | Verbatim | Profile | Price(s) | Shape / qualifier | Role |
|---|---|---|---|---|---|---|---|
| 1 | `transcripts/2026-02-13_deqIr8DaydA.txt:1` | 02-13 | "between the weekly pivot, which is up here at 6896 and the 68.40 area right here that splits these two JBAs. I want to see some two-way trades" | unspecified | ES 6840 | "splits these two JBAs" (not called LVN in the transcript; the plan reads it as the splitting LVN) | two-way-trade boundary between adjacent JBAs |
| 2 | same | 02-13 | "We have a large um LVN through here, but with yesterday's activity, if we begin to build or find interest above the weekly pivot, I would expect us to begin shifting and gravitating towards the 6953 area." | unspecified | ES between 6896 and 6953 | "large LVN" — the gap between two JBAs | traverse/acceleration zone, not a barrier |
| 3 | same | 02-13 | "960 right here is the most prominent LVN. It's the deepest LVN on the 5day rolling. We've got PAC up high. So, the pressure is still on as long as we're in this distribution." | **5-day rolling** | NQ 24960 | "most prominent", "deepest"; just above the JBA top (900s); "PAC up high" = POC up high | acceptance gate: build above → shift toward the weekly pivot; else two-way 24700–24900 |
| 4 | `transcripts/2026-02-17_TAn4ly-3MDw.txt:1` | 02-17 | "naturally, we do have this primary LVN up here in the low 40s, but let's zoom in on this here. Um, look at our 4hour rolling." | longer lookback (contrasted with 4-hour) | ES low 6840s | "primary LVN" — overhead, de-emphasised | overhead reference, set aside for nearer structure (D2) |
| 5 | same | 02-17 | "we did have our test through the previous week's low and we've got a nice little LVN right here. So this 6816 area is what I want to key on 16 to 18 right here. And so if that stays bid, then I would expect us to stay in some balance and two-way trade between here and the Gline." | **4-hour rolling** | ES 6816–18 | "nice little LVN", 2-pt band; at the prior week's low test | bid/hold anchor; below → "press into the 6755s" |
| 6 | same | 02-17 | "We have a primary LVN right here essentially at the JVA low right here around 569. … We'll just call it even the JBA low 6 to 70 area. I want to see that bid" | unspecified (4-hour context) | NQ 24566–70 | "primary LVN … essentially at the JBA low" — collapsed onto the JBA edge | bid anchor; below → "dive into the 1B, which is that 24,353" |
| 7 | `transcripts/2026-02-20_yjv7fJnkwTA.txt:1` | 02-20 | "up here 68.88. I want to watch step for offer. Other option is poke above there. Watch for reoffer back into that. That's kind of like an LBN return on the higher time frame on a 5day rolling." | **5-day rolling** | ES 6888 | "LVN return on the higher time frame" | reoffer on the return into the LVN |
| 8 | `transcripts/2026-03-02_zRU22muRdlI.txt:1` | 03-02 | "We did tag into the 71s last night. We got a nice little response out potentially a little exhausted node out of that." | overnight | ES 6771 (weekly 1B) | "little exhausted node" | exhaustion evidence at the bottom of the caution zone |
| 9 | same | 03-02 | "we have a small amount of support here at around 6802 into this wide LVN 682 to 6806 range. Um, if we do auction below that, I want to reoffer that uh aggressively to press for the overnight low gauge for continuation under the 1B." | unspecified | ES 6802–06 | "wide LVN", 4-pt band | support / acceptance gate; "If we get underneath that, I expect us to accelerate" |
| 10 | same | 03-02 | "Both of them give this little exhaustive looking node around 24,600 on NQ. And so it's uh at 6802 on ES. … If they just cannot get the ball rolling, find any interest under there, then that speaks for a push back into the weekly pivot" | overnight | NQ 24600 / ES 6802 | "little exhaustive looking node"; "a little minor support there" | response gauge — approach-failure below it flips the read long |
| 11 | `transcripts/2026-03-06_5EAXvm36rbA.txt:1` | 03-06 | "We have an L primary LBN below us in the 7 700 range and the Genie line just below that." | unspecified | NQ 24700 | "primary LVN" stacked with the G line just below | support under PDL; hold → back into the RP; below → "beline south" |
| 12 | `transcripts/2026-03-16_1h_JeSgR9_A.txt:1` | 03-16 | "we're currently above the weekly pivot between um that LVN from last week's volume profile 6745 and right here… now we're up into this primary LVN. … look above the overnight high and fail, come back in. I want to treat this as being the upper portion of this two-way trade" | **last week's profile** | ES 6745 | "LVN from last week's volume profile", "primary LVN" | upper boundary of two-way trade; reoffer on look-above-and-fail |
| 13 | same | 03-16 | "building below the weekly pivot. I want to press in the direction of this high volume edge. However, along the way, 6671 right here in the Gline uh can offer some sort of support." | unspecified | ES HVE below the weekly pivot | "high volume edge" | downside destination |
| 14 | same | 03-16 | "We're at the upper portion of that um wide LBN. … unless we get any acceptance above the 900s, a look above the overnight high and fail, I want to lean in on that and press it into the direction of the weekly pivot" | unspecified | NQ ~24825–24900 | "wide LVN"; price at its upper portion | reoffer zone unless accepted above 24900 |
| 15 | `transcripts/2026-03-17_KNxA1k-RL94.txt:1` | 03-17 | "we have this 45 area on the uh, 5-day rolling aspect here. It's a high volume edge. Right up here, previous day's high. And the 81s right here as well. So, 81 to 85 area. If we look above that and come back in, then… I want to treat that as a fail… If we give up the 45s back to weekly pivot, watch for bid." | **5-day rolling** | ES 6745 (HVE); 6781–85 band | "high volume edge" | HVE = hold/give-up line for the long read; 81–85 = look-above-and-fail reoffer zone (antecedent of "high volume edge" is ambiguous between 45 and 81–85) |
| 16 | `transcripts/2026-03-18_1sx-X1B6MGc.txt:1` | 03-18 | "We still have this LVN right here we're currently interacting with. I'd expect this to be supportive to push us back into this node. If we do find ourselves auctioning, let's say under the 4045 area, building volume, then two places that I'd like to see bid, one is the weekly pivot down here, and the other one is uh 6671." | unspecified (same 6745 area 03-17 called the 5-day HVE) | ES 6740–45 | LVN adjacent to "this node" — the LVN sits immediately outside the HVN's edge | support; acceptance below → next bids at weekly pivot / 6671 |
| 17 | `transcripts/2026-03-19_h4oc2xoEMlY.txt:1` | 03-19 | "above the weekly pivot, I'd be looking um for a sustained build and and push into um into this LVN up here at 6740s." | unspecified | ES 6740s | same LVN as #16 | upside destination |
| 18 | same | 03-19 | "NQ, down here fighting right around G line prominent LVN down here at the bottom of auto plot as well around 346 to 320. … We want to press into that first en route to previous week's low" … "If we're above the G line, then I'm not against re-bidding this area down here into this LVN for a press up into the weekly pivot, but that's where I'd want to reoffer as well." | unspecified | NQ 24320–46 | "prominent LVN" stacked with G line + bottom of Autoplot; 26-pt band | first downside target; rebid anchor if above G line, reoffer anchor if below |
| 19 | same | 03-19 | "we have a nice node built out here… If we're auctioning below or into this node down below that G line, I want to reoffer the G line" | unspecified | NQ node near the G line | "nice node" (HVN) | acceptance container — inside/below the node flips to reoffer |
| 20 | `transcripts/2026-03-20__X30tjUvddc.txt:1` | 03-20 | "We have previous week's value low, a large tip tail on the, um, four-week rolling. We zoom in. I don't necessarily like the bottom of this build on this 5day rolling volume profile, but pocket is down here at the lows. So, um, 24485 half and RP right here and the Gline. A lot of NGI right here. So, I want to see this offered." | **four-week rolling** (tail) + **5-day rolling** (build) | NQ 24485.5 | "large tip tail"; "don't necessarily like the bottom of this build"; POC at the lows | counterexample: poor build quality, overridden by MGI confluence → offer |
| 21 | same | 03-20 | "press back into the weekly pivot to gauge for continuation up into this LVN, potentially up into the weekly VWOP, which is 758." | unspecified | NQ LVN between weekly pivot and 24758 | plain "this LVN" | upside destination |
| 22 | `transcripts/2026-06-02_D7sEQ7dYisk.txt:1` | 06-02 | "here we are coming down to the high volume edge in the night rotating now back across this zone" … "This down here 68 to 72, want to see it defend otherwise pretty quick to this 7549" | unspecified | ES 7568–72 | "high volume edge" | overnight-tested support |
| 23 | same | 06-02 | "Um up here, I want to watch this as an exhaust of note on top of the volume profile. So, watching this 2024 area um for resistance. Keep us in a wide balance." | unspecified (the profile whose top is 7620–24) | ES 7620–24 | "exhaustive node on top of the volume profile" | resistance / reoffer; keeps balance |
| 24 | same | 06-02 | "We zoom in. We could see that the 24s top of the JBAs, 77s bottom of the JBAs, 68 72 LVN right down here. So, look outside of the JBA and back in uh would be a long." | unspecified | ES 7568–72 | the same 68–72 called "high volume edge" in #22 and "LVN" here — the LVN directly beneath the HVE, just under the JBA bottom (7577) | look-below-and-fail long anchor |
| 25 | `transcripts/2026-06-15_LnFBIc8V168.txt:1` | 06-15 | "this high volume edge is pretty much where that uh pivot is placed." | unspecified | NQ 30377 | HVE coincident with the pivot | bid anchor (confluence) |
| 26 | same | 06-15 | "We have less good volume through there, so at some point I'd expect that to be addressed. However, um down here at 77, 377 in that vicinity into that LVN from last night, that's where I want to see bid." | **overnight** | NQ 30377; thin zone 30191–30377 | "LVN from last night"; "less good volume through there" (gap to the G line, a future fill) | bid anchor for two-way trade |
| 27 | `transcripts/2026-06-16__oU-URhOEUM.txt:1` | 06-16 | "I want to see this 6 7615 area bid for continuation or at least test up into this 36 to gauge for continuation. That OBN can be pretty prominent today." | unspecified | ES 7636 | "OBN" = LVN; "can be pretty prominent today" | continuation test target / gauge |
| 28 | same | 06-16 | "If we get built below that, I would expect to come and explore some into this LVN um and put a little pressure on the 1A." | unspecified | ES between 7615 and the 1A (7607–08) | plain "this LVN" | downside exploration target |
| 29 | `transcripts/2026-06-18_kSTzKPQFCC4.txt:1` | 06-18 | "we get an aggressive move up and out with potential exhaustive node down there. … even in the overnight profile, we have a real nice node right here. That is located at the 7533 to 29 area. And that's below the G line… structurally, we're leaving that node, that LVN right down there." … "any type of activity below that G line, I want to see us rotate down into that LVN to then gauge a response before rebid. Cuz otherwise, I would expect us to find continuation through that wide zone." | **overnight profile** | ES 7529–33 | "real nice node", "potential exhaustive node", then "that node, that LVN" — node at the low + thin departure above it treated as one structure | response gauge before rebid; failure → continuation through the wide zone |
| 30 | same | 06-18 | "we have a wide zone down through here, and we're just building out this real nice node. Watch the uh 30,600 area to 630 for um potential offer to rotate back and in to uh at least the 500s to rotate back and into the POC of this distribution." | unspecified | NQ 30500s (POC) | "real nice node"; "the bulk of this mix" | rotation destination (POC) |
| 31 | `transcripts/2026-06-22_BieHs_bLlt4.txt:1` | 06-22 | "dip down below um into that OVN and no dice. Back above G line" | — | ES below G line | "OVN" — LVN garble or "overnight [low]"; ambiguous | look-below-and-fail evidence |
| 32 | `transcripts/2026-07-07_X0NpbKM2KUA.txt:1` | 07-07 | "Even better would be a look below and fail that overnight low to be able to get on board with the little exhausted node." | session/overnight | NQ 29567 (JBA low ≈ ONL) | "little exhausted node" | exhaustion evidence qualifying the long |
| 33 | `transcripts/2026-07-10_XItRia6NPbQ.txt:1` | 07-10 | "we have auto plot high, previous week's high, uh JBA high, everything right here. We're not out of the woods. We'd have to build above 7600 above this LBN in order to get going." … "between that and 7 7600. Um kind of purgatory there." | unspecified | ES 7600 | LVN stacked with Autoplot high / PW high / JBA high | acceptance gate; 7591–7600 = purgatory band |
| 34 | `transcripts/2026-07-20_66ryWxqne8k.txt:1` | 07-20 | "right here at the cell VM that could be a pretty large um hurdle to get over and so if we can't do that by getting and holding above the overnight high, then still want to just treat this zone we came from here as two-way trade" | unspecified | ES ~7545 | "the cell VM" = "this LVN" | overhead hurdle between the zone and the weekly pivot |
| 35 | same | 07-20 | "up here we have the split zone between 255 and 332… This is the zone I want to watch for a potential offer stepping in." | unspecified | NQ 29255–29332 | "split zone" (not called LVN) | offer zone between JBAs |
| 36 | `transcripts/2026-08-04_jvSf2rtihWY.txt:1` | 08-04 | "The other location is down here at 7626. So, 24 to 26. The high volume edge to the bottom of the JBA. Looking for bid there. If we're building below the 7624s, then we got a lot that we can liquidate and clean up through there." | unspecified | ES 7624–26 | "high volume edge to the bottom of the JBA"; below it "a lot that we can liquidate and clean up" (thin) | bid anchor; acceptance below → liquidation through the thin area |
| 37 | same | 08-04 | "I would be looking for this 29,200 area this LVN on the 4-hour rolling initially if ES bids from the 48 range." | **4-hour rolling** | NQ 29200 | plain "this LVN on the 4-hour rolling" | first rebid location |
| 38 | `transcripts/2026-08-07_TpIyLl3_aVY.txt:1` | 08-07 | "primary LBN right here around the 77 58 to 60 area. And so, that's just above the JBA lows here. And so, this is where I want to see rebid… if we do get inside of that 58s, then naturally I'd expect a response from 51… Getting below the 51s um can accelerate and flush out some of this inventory through here." | unspecified | ES 7758–60 | "primary LVN", "just above the JBA lows", 2-pt band | rebid anchor; fallback at JBA low 7751; below → flush |
| 39 | same | 08-07 | "680 area, 680 to the 700 area. We'll see that bid… If we get inside of the 608s, then I'd expect this to flush out" | unspecified | NQ 29680–700 | NQ analogue of #38 | rebid anchor |
| 40 | `transcripts/2026-08-11_G-4-sVT_uok.txt:1` | 08-11 | "I'm leaning towards this re-bidding from the 79 to 82 area into this LVN right through here. Want to see that bid press up and test the 804s." … "initially, what I'm looking at here is 7780s for re-bid into that LVN." | unspecified | ES 7779–82 | mid-zone LVN inside the JBA (7720s–7804); 3-pt band | primary rebid anchor |
| 41 | same | 08-11 | "I'm looking for re-bid here around 29,800 to press the 949s" | unspecified | NQ 29800 | NQ analogue of #40 | rebid anchor |

No LVN/HVN mentions in: 05-26, 06-10, 06-17, 07-23 (07-23 has only the exhaustion requirement — see D6).

### A2. The Job Pivots deep dive (`reference/job-pivots-deep-dive.txt`)

| # | Line | Verbatim | Notes |
|---|---|---|---|
| 42 | :160 | "It changes when it stops respecting the tapers. It stops respecting the LVNs below and so forth, and it starts to push and build." | balance → trend transition = LVNs/tapers being breached |
| 43 | :166–175 | "So exhaustive looks on the profile. So if you have something like this, and you get a spike up, and you get a volume build from that, traverse back across… How do we know if it's exhaustive? It moves away and aggressively… And so that would show a small build above this. And therefore, when we return to that, we would expect that player to be in command" | **visual definition of an exhaustive node**: spike, small build at the extreme, aggressive departure |
| 44 | :211–223 | "Areas of initiation on the volume profile are low volume nodes. There's not a lot of volume there. It just jams out of there. Not a lot of opportunity to place interest. So it pushes and then it finds a new place where there's interest to be had. And these targets tend to find themselves at areas of high volume nodes that are built upon the current session." | LVN = initiation; HVN = destination |
| 45 | :223–229 | "when does it stop? It stops when the areas of initiation are breached back through… that's where something can be changing. First, we expect balance." | LVN breach = regime-change signal |
| 46 | :232–235 | "1A here in this example being the high volume edge to the lower side needs to be protected. This up here winds up being a high volume node right over here. And so therefore, anything activity inside of this would make me assume that we're coming back down." | HVE as a protect line; HVN as rejection evidence |
| 47 | :265 | "Area of initiation. We're thinking LVN or we're thinking where we just absolutely slammed through, where we expanded very quickly and left a wide kennel." | wide LVN ("kennel") = fast expansion |
| 48 | :274 | "I prefer to see this on LVNs based upon either the current session or four-hour rolling, so forth." | lookback preference for initiation LVNs |
| 49 | :313 | "I like to gauge this against the 5-day rolling volume profile or a 4-hour volume profile, to see where I have some overlap." | JBA boxes gauged against 5-day / 4-hour profiles |
| 50 | :324 | "now we have this area of thin volume on the profile to gauge as a new build: if we get above this, I am no longer interested in shorting anything down here." | thin area as acceptance gate |
| 51 | :330 | "If we have a primary LVN right here and this comes down and pauses, that grants you context of where you are." | primary LVN as location context |

### A3. Replays (execution evidence — 9 videos)

| # | Source | Verbatim | Profile | Price | Qualifier | Role |
|---|---|---|---|---|---|---|
| 52 | `replays/2026-06-30_FrSP2kDoJvs.txt:38–46` | "the RTH volume profile the 4hour rolling volume profile the 5day rolling volume profile, the four-week rolling volume profile. I don't place as much emphasis on the leg to leg as far as needing to come back and complete that auction." | the full stack | — | — | which profiles count |
| 53 | `:81`, `:101–104` | "we do get a wide LVN when we do finally burst out of this" … "in that sweep, uh, we do get a very wide LVN. And this comes into that 710 or 7510 area up to about the 14s. We get a burst up and out." … "This is zone of interest. This is an area of initiation." | session | ES 7510–14 | "very wide LVN" created by a burst | zone of initiation → first rebid reference |
| 54 | `:143–147` | "my eyes are on this zone down here, 14 down to 10. That primary LVN right there. Yes. Did we create another one at 18? We certainly did. Zone of initiation is right here around the 14 to 10 zone." | session | ES 7510–14 vs 7518 | "primary" = the initiation LVN, even with a newer one at 18 | ranking |
| 55 | `:206–209` | "Now where's our primary LVN's? Well, this is the deepest LVN. So deepest meaning primary. So we have 28s, we have the 18s down to this mix." | session | ES 7528, 7518 | **"deepest meaning primary"** — explicit ranking rule | candidate rebid zones |
| 56 | `:297–300` | "Now on the RTH volume profile or on the volume profile that's showing the day there um 18s are the primary" | RTH | ES 7518 | ranking is profile-specific | |
| 57 | `:307–308` | "we have the primary OVN at the 28s to be able to rebid" | session | ES 7528 | "primary OVN" (= LVN) | rebid |
| 58 | `:331–334` | "Now we're building a node. So now we also have the IB high right there. The 34s. Good reference. It's also on the high volume edge of that node or that distribution just below us." | session | ES 7534 | HVE of the node = the IB high | hold reference |
| 59 | `:343–348` | "pushing and building another node can be extremely productive as long as we're holding and maintaining the prior distribution. If we begin to give up prior distribution, then we begin to look at an exhausted node." | session | — | when a new node becomes "exhausted" | |
| 60 | `:373–377` | "with the primary LVN at the 7518s. This is now a line in sand. It opens up that large distribution below us and as long as we're above that. Yep. I'm looking for rebid scenarios." | session | ES 7518 | "line in the sand" | gate |
| 61 | `:493–497` | "I personally did not have skip volume on the leg to leg volume profile… I don't place a lot of weight on that. I want to see that on the RTH 4hour, the 4-week or the 5day rolling volume profile." | — | — | leg-to-leg de-weighted | |
| 62 | `:512–522` | "where are we building a node and we're coming back through an LVN? Well, that shows you an early sign of weakness to be able to take something off the table… are we holding that most that deepest LVN along the way" | session | — | "most… deepest LVN" | early-weakness tell |
| 63 | `replays/2026-07-17_glG8-dCLba0.txt:20–21` | "we had a very nice uh build that was occurring and creating that primary LVN at the 370s… it was very well respected." | session | NQ 29370 | "primary LVN" formed by a build at the JBA edge | |
| 64 | `:45–47` | "It's not a ledge. It's not a volume ledge, but it's pretty darn close where 310's built in. And in looking at that, the previous PAC was set at 410 right up here, 100 points above." | session | NQ 29310 / POC 29410 | "ledge" (almost), POC 100 pts above | unfinished profile |
| 65 | `:66–70` | "we have the primary LVN right there at the 370s. So below the 370s we have this building out and made reference to this as being not the best node uh primary LVN's above us 370s and then much higher in the 400s." | session | NQ 29370, 29400s | "not the best node" below; two primary LVNs above | |
| 66 | `:75–78` | "when I see a node building out like this, um, naturally you have your primary LVN, but essentially I look at this and say, 'All right, can we fill this through here?' And if we do, then bids above that 370." | session | — | fill test | |
| 67 | `:85–90` | "approaching the level of volume that is from PAC where it previously came from just above, you can see that faint blue line above us. um then I want to pay attention to that for a shift of that pock or even shift of value where we're at the edge of a range and we get an exhaustive look." | session | — | visual: the faint POC line; volume at the extreme approaching the prior POC's height | POC-shift watch |
| 68 | `:96–108` | "is this volume profile done? … you can almost qualify that as a ledge. I don't qualify this as a ledge, but um yeah, it's right about there. It's not finished. If anything, when we push down in, we have the 310s there. We have this little notch" | session | NQ 29310 | "ledge", "notch" | completion test |
| 69 | `:161–163` | "we still have unfinished business at the bottom of that volume profile. We don't have either a parabolic taper. We don't have an exhaustive node. Pock has shifted down." | session | — | the two completion shapes named | |
| 70 | `:299–300` | "the high volume uh node of that distribution is right here in the low 80s." | session | NQ 29280s | HVN of the lower distribution | risk reference |
| 71 | `:308–316` | "this is the uh anatomy of an exhausted node. So we push up and in through this mixer here where… value shifted down to the bottom and you have this primary LVN um and it's a little bit wide. So let's say primary OVN right here at the upper 90s, low 90s right here and squint and look at that zone" | session | NQ 29290s | "a little bit wide"; "squint" | zone to respect |
| 72 | `:493–503` | Q: "if price had pushed up into that LBN at 370, would you have been looking to offer that weak structure below?" A: "Yes. Yes… in order to get long, I want to see an exhaustive node or a parabolic taper or something like that. Um, but if we had jammed up and out of this after this pinch straight to the 370s, then from my end, that would be a very clean short" | session | NQ 29370 | LVN above a weak (unfinished) build = offer | |
| 73 | `:510–514` | "Can you see the difference between the lower build versus what it looks like when it's exhaustive? with a taper or an exhausted node." | session | — | visual contrast | |
| 74 | `:569–571` | "If we get two LVN's behind, then something's changed, right?" | session | — | two LVNs breached = regime change | |
| 75 | `replays/2026-06-26_l4xvVNTE_H8.txt:75` | "that reference is also next to very prominent LVN" | session | ES 7410–14 | "very prominent" | confluence |
| 76 | `:99–103` | "we come down into primary LVN and also into the LZ. … if you want to tag that as saying which one is the most prominent, then you're gonna have to do some work on your back end" | session | ES 7410s | prominence of LZs needs back-testing | |
| 77 | `:134` | "We came above the RP. We drove up and out of that area. We left an LVN in this area." | session | ES 7410–14 | LVN = what an aggressive departure leaves | |
| 78 | `:269` | "this area through here is formidable. We have a primary LVN. We have a V range. We have a liquidity zone" | session | ES 7410 | | confluence stack |
| 79 | `:317–318` | "primary LVN between the uh well right around high volume edge is 7412 to like 14 5 area through here." | session | ES 7412–14.5 | LVN located at the HVE | |
| 80 | `:338–339` | "7410s right here, we have a little high volume node. If we spend too much time there, then by all means, uh, that's not going to be great" | session | ES 7410 | small HVN under the LVN — time spent there = bad | |
| 81 | `:390–395`, `:413–415` | "We're dead center in this distribution, right? So, where is it likely to see the offer step back in… On this side of the distribution." … "Where is the most ideal range to short this? Uh up the upper high volume edge. Where's the most ideal range to long this down here? Right in between." | session | — | HVEs are the edges to trade; the middle is not | |
| 82 | `:425–426` | "Watching our offer stepping down into that high volume edge into that LBN." | session | — | HVE → LVN sequence | |
| 83 | `:431–434` | "On our leg to leg, we have an LVN at 23 range. But looking at this overall in the profile on the right, what we can see is this LVN. That's where you want to watch it." | leg-to-leg vs. main profile | ES 7423 vs 7414 | the larger profile's LVN wins | |
| 84 | `:511–512` | "now I want to isolate my overall primary LVN is the 14s." | session | ES 7414 | "overall primary" | |
| 85 | `:700–703` | "in this local distribution, this 14 to 12 area, yes, I know the low is a little bit below that, but that's the zone I want to see respected because that's zone of initiation." | session | ES 7412–14 | stop reference is the LVN, not the low | |
| 86 | `:784–794` | "until you leave the node… you can look at multiple different time frames of volume profiles to you leave the node um from the RTH sense… session node or leg node as well." | RTH / session / leg | — | thesis valid until the node is left | |
| 87 | `replays/2026-05-28_bFU1dXf5uw8.txt:13–27` | "on the four-hour rolling and also on the session itself… there are two locations here that are pretty clean. One is high volume edge, 34s… I was looking to go long on a pullback into the LVN from the day profile and the five-day profile at 34 to 32" | **4-hour rolling + session; day + 5-day** | ES 7534 (HVE), 7532–34 (LVN) | HVE and LVN co-located | long pullback zone |
| 88 | `:203–205` | "Nobody's willing to come through that LVN that's around the 31s. 31s kind of release the uh that's where the gas pedal gets going." | session | ES 7531 | LVN = acceleration point | |
| 89 | `:222`, `:257` | "Into that LVN, that zone of initiation." … "I'm looking for a push through that LVN into the prior distribution." | session | ES 7531 | | |
| 90 | `:292–295` | "On the leg to leg, we're building a node into the 32 to 30 four area or LVN. We're building a node above that." | leg-to-leg | ES 7532–34 | node building into the LVN = filling | |
| 91 | `:361–362` | "Watch for ads. You have an LVN at 37. You have an LVN uh down below you. They're at 30." | session | ES 7537, 7530 | two LVNs bracketing | add locations |
| 92 | `replays/2026-05-04_9iNMcMoI9nk.txt:151–156` | "if you look at the 7258s primary LVN right here, primary LVN, and then just below us, we have this entire mix of MGI. Okay, so that 7258 should be a target." | session | ES 7258 | "primary LVN" | target for a short |
| 93 | `:216–222`, `:242` | "those 58 primary LVN just below you can be a primary bid zone… that's a zone of initiation after leaving the prior distribution." … "Tag it off into the 58s. Primary LVN zone of initiation. Natural place for response." | session | ES 7258 | LVN = initiation = response | |
| 94 | `:543–547` | "we have an LVN at 16… we have the LVN at 16, we have the overnight low… knock on the door of one of these. So 16 or the overnight low at 13 3/4" | session | ES 7216 | | rebid test |
| 95 | `:648–649` | "now we're kind of in purgatory on the high volume edge into that LBN. Ah, let it move." | session | — | between HVE and LVN = purgatory | |
| 96 | `:678–679` | "LVN right here. I'm looking at this as as exhaustive." | session | — | | |
| 97 | `replays/2026-04-30_5124WmFuurg.txt:54–62` | "You might be wondering, 'Well, why aren't you looking at an LVN?' Well, uh pretty much off the open, we have this aggressive type of push down. This I view as two-way trade. Going park [POC] is pretty much in the you know, it's not in the center. But it's not at the edges. It's not at the extremes." | session/TPO | — | LVN declined | D3 |
| 98 | `:104` | "not looking to just dive in like a dragon with a hemorrhoid at that LVN because we're back inside of value." | session | — | LVN inside value = no entry | |
| 99 | `:242`, `:439`, `:455`, `:500–501` | "natural next place would be down into the high volume edge for response, and then ultimately overnight low." … "looking for the 200 range right in here on the high volume edge as value shifts back down" … "get in on this high volume edge because with that shift, yeah, that's showing interest." | session | NQ ~27200–204 | HVE as the rebid location | |
| 100 | `:722–729` | "the 4-hour rolling and the 5-day rolling and the 4-week rolling. The same concept applies across the board for me. It's just different time frames mean different things. You can have quite a bit more wiggle room on a 5-day rolling and a 4-week rolling or even an RTH than you will have on a 30-minute." | stack | — | tolerance scales with lookback | |
| 101 | `:918–919` | "coming into the long down here, was looking at the high volume edge. We have high volume edge, we have value area low, we have overnight low." | session | — | confluence | |
| 102 | `replays/2026-04-24_JMWo4IpN8yA.txt:9–13` | "the one location with that wide LVN from the overnight portion of the session that I was really looking at is the 760s… a rebid long from that overnight LVN area" | **overnight** | NQ 27760 | "wide LVN from the overnight" | rebid long |
| 103 | `:67`, `:84` | "sweep down through the 24hour VWOP into the high volume edge that we actually get bids stepping back above the 80s" … "test down into this area into the high volume edge, get a bid from there" | session | NQ 27180s | HVE | bid |
| 104 | `:175` | "We have a nice taper tail down underneath the 160s." | session | NQ 27160 | "taper tail" | exhaustion shape |
| 105 | `replays/2026-04-08_u-S6Rvj7hIY.txt:32` | "we had a zone up high like this, and then the rest of the zones were down below us, and we have that wide LVN through here, if we're going to do this, it's going to go fast." | 5-day (JBA context) | ES | "wide LVN" between JBAs | speed expectation |
| 106 | `:105–119` | "We have a large LVN below us, but based upon the pivot zone through here, expecting that um we're going to have some sort of JBA build out… we want to see that pull back into here, and that's more of a primary. So, if I'm going to spend my time and my mental capital upon an entry, I want it to be in this zone… and we can work against that into the LVN." | session / JBA | — | entry at the JBA build, LVN as the risk reference | |
| 107 | `:479–480` | "we're up into POC on the session. And we have the high volume edge above us." | session | NQ 25110 | HVE above POC | |
| 108 | `:554–571` | "We have this node right here. We have this ambiguous type of looks like a bunch of sticks on the volume profile. You get more comfortable in looking at this, you'll be able to pick it out. And so, we have this through here, these HPNs that are tiny. And then up here, we have a defined node. Therefore, I'm going to group this like this. Use this an LVN, and this is an LVN, and in between we have the buy side delta" | session | NQ 24950 area | **visual grouping rule**: tiny HVNs ("sticks") grouped; two LVNs bracket a delta build | |
| 109 | `replays/2026-05-19_RaJRUnHR_Rg.txt:147–148` | "we also have an LVN in the 60 or we have high volume edge in 68s." | session | ES 7560 / 7568 | LVN below, HVE above | lean zone |
| 110 | `reference/ofl-101-time-and-sales.txt:69–73` | "coupling with the Dom volume profile top and bottom range activity for reversion absorption initiative activity and breakout activity so this here is an LVN return watch the offer" | DOM volume profile | — | "LVN return" | DOM read at an LVN |

### A4. Volume Profile 101 (`reference/volume_profile_101.txt`)

The one-on-one teaching session in which Job defines the vocabulary from the ground up. Unlike
the preps (which name prices) this one names the **anatomy** — it is the only source that
states how to *spot* a primary LVN, that a secondary class exists, and what a volume ledge
looks like. Auto-captioned, one phrase per line; citations are line ranges, quotes are the
lines joined with whitespace normalised. Garbles: "LBN"/"obn"/"lvan"/"Lans" = LVN, "HPN" = HVN.

| # | Source | Verbatim | Concept |
|---|---|---|---|
| 111 | `:19-33` | "one is a high volume node and those are the Peaks volume the large projections of volume out there a low volume node is where we're lacking in volume the low areas the point of control is the highest of the high volume node" | base terminology: HVN = peak, LVN = lack, POC = highest HVN |
| 112 | `:33-48` | "a volume build is when we're in an area and building out of note even if it's small if it's transacting and we're gaining volume there um it's a build a taper is a little bit of a different thing" | **build vs taper** — the two things that can happen away from a node |
| 113 | `:44-48` | "that looks like bit of a parabolic taper or you can also have a 45 degree taper but it's a it's a lack of um accumulation As you move away from the high volume node" | **taper anatomy**: progressive fall-off, parabolic or 45-degree |
| 114 | `:81-86` | "the easiest way to spot a primary LVN is just look all the way to the right and see which ones are closest think of it an inverse and so the deepest one's primary" | **how to find the primary**: absolute bar-tip shortness across the whole image, not local depth |
| 115 | `:87-92` | "that's a secondary LVN and although it can offer an initial uh response that it's more likely to be filled in between the distributions" | **secondary LVN class** — responds, but gets filled; not primary |
| 116 | `:95-99` | "here's a primary obn right there and one right here so between the two we have a distribution of volume" | **distributions are the zones between primary LVNs**; the primary is the wall, not the hump |
| 117 | `:93-96` | "when I say distribution I don't mean um accumulation versus distribution I mean the Zone in which that auction is located" | disambiguation: "distribution" = the auction's zone |
| 118 | `:142-148` | "the out sides that it's not escaping are the lvns because when it escapes it's can head into the next distribution" | LVNs are the walls price escapes through (reinforces B12) |
| 119 | `:328-335` | "we come to the edge of a profile we have a firm uh clean distribution nice LVN and it immediately steps off" | **exhaustive-node anatomy** at a profile extreme |
| 120 | `:403-414` | "we have a volume build and then we basically have a flat line let it smack you in the face" ... "we're just building a Le literally a ledge well how to use this this is a sign of temporary exhaustion" | **volume ledge**: a flat stack of equal-length bars = temporary exhaustion |
| 121 | `:427-434` | "here's a volume ledge watch this up here as price is moving up it's not finished it's not finished" | the ledge is the *unfinished auction* tell |
| 122 | `:476-486` | "where you'd want to be looking is where those zones of initiation are for a toe touch into that" | zones of initiation = the LVNs (trade selection, not perception) |


## B. Synthesis — what makes an LVN "notable / primary / deepest"

1. **Depth is the ranking axis, stated outright.** "this is the deepest LVN. So deepest
   meaning primary" (#55); "960 right here is the most prominent LVN. It's the deepest LVN
   on the 5day rolling" (#3). Depth = how little volume sits at the trough relative to the
   nodes on either side; "very prominent" / "most prominent" are synonyms for deepest.
2. **Ranking is per profile.** The 5-day rolling primary and the RTH primary differ on the
   same day (#55 vs #56). He always names the profile: "on the 5day rolling" (#3, #7, #15),
   "on the 4-hour rolling" (#37, #5), "from last week's volume profile" (#12), "in the
   overnight profile" / "from last night" (#29, #26), "from the day profile and the
   five-day profile" (#87).
3. **A notable LVN is a departure scar, not a random trough.** "We drove up and out of that
   area. We left an LVN in this area" (#77); "in that sweep, we do get a very wide LVN… We
   get a burst up and out" (#53); "where we just absolutely slammed through, where we
   expanded very quickly and left a wide kennel" (#47). The LVN of interest is the zone of
   initiation of the current leg.
4. **Position: at the edge of a distribution, adjacent to a high-volume edge.** The LVN is
   repeatedly located directly outside the HVE: "primary LVN… right around high volume
   edge is 7412 to 14.5" (#79); "high volume edge, 34s… LVN… at 34 to 32" (#87); #22/#24
   call 7568–72 both "the high volume edge" and "68 72 LVN"; #16 "this LVN… supportive to
   push us back into this node." The notable LVN is the thin shelf immediately beyond a fat
   node's edge, not a dip inside the node.
5. **Position relative to structure boxes.** Preferred LVNs sit on a JBA edge or just outside
   it: "essentially at the JBA low" (#6), "just above the JBA lows" (#38), just under the JBA
   bottom (#24), "at the bottom of auto plot" (#18), or **splitting two JBAs** (#1, #35). A
   mid-box LVN is used when it is the only internal structure (#40).
6. **Width is a qualifier, not a disqualifier.** "wide LVN 682 to 6806" (#9), "very wide
   LVN… 7510 up to about the 14s" (#53), "wide LVN from the overnight" (#102), "it's a
   little bit wide… squint and look at that zone" (#71). Wide LVNs are expected to be
   traversed fast (#105 "it's going to go fast"; #9 "I expect us to accelerate"). Narrow
   "nice little LVN" (#5) gets a 2–4 pt band. The entry band inherits the LVN's span.
7. **Top/bottom of profile = exhaustive-node territory.** "exhaust of note on top of the
   volume profile" (#23); the anatomy: "a spike up, and you get a volume build from that,
   traverse back across… a small build above this" (#43); "a nice taper tail" (#104),
   "parabolic taper" (#69). The LVN left behind by that departure is the return/rebid
   reference ("LVN return", #7, #43).
8. **Relation to POC / value.** An LVN inside value is not an entry (#98). POC at an extreme
   with an unfinished build below it means the nearby LVN is a *target*, not a fade (#64,
   #68). POC central = two-way trade, no LVN trade (#97).
9. **Lookback by purpose.** 5-day rolling: the structural/primary LVN and HVEs used to gauge
   JBA boxes and weekly references (#3, #15, #20, #49). 4-hour rolling / current session:
   initiation LVNs for entries (#48, #37, #5). Overnight profile: fresh response nodes (#26,
   #29, #102). Four-week: tails only (#20). Leg-to-leg: de-weighted (#61, #83).
10. **Tolerance scales with lookback** (#100).
11. **Visual grouping.** Tiny nodes are merged and LVNs are read at the boundaries of the
    grouped mass: "a bunch of sticks… these HPNs that are tiny. And then up here, we have a
    defined node. Therefore, I'm going to group this like this. Use this an LVN, and this is
    an LVN" (#108).
12. **Semantics.** LVN = initiation, acceleration, and the place a trend ends when breached
    back through (#45, #74). HVN/HVE = destination and the edge to lean on (#44, #81).

13. **How to *spot* the primary: absolute thinness, read across the whole image.** "the
    easiest way to spot a primary LVN is just look all the way to the right and see which
    ones are closest think of it an inverse and so the deepest one's primary" (#114). Bars
    grow left from the price axis, so the primary is the LVN whose bar tips stay *nearest
    the axis* — compared against every other trough in the image, not just its two
    neighbours. B1's "deepest" is the same fact stated as a ranking; #114 is the procedure.
14. **Secondary LVNs are a real class, and they are demoted, not dropped.** "that's a
    secondary LVN and although it can offer an initial uh response that it's more likely to
    be filled in between the distributions" (#115). A shallower trough *inside* a
    distribution still gets reported — it can produce a first response — but it never
    competes for primary. This is the positive half of D3/D10: report it, rank it low.
15. **Distributions are the zones *between* primary LVNs.** "here's a primary obn right there
    and one right here so between the two we have a distribution of volume" (#116);
    "distribution… I mean the Zone in which that auction is located" (#117); "the out sides
    that it's not escaping are the lvns" (#118). So the count of humps sets the profile
    shape, and the primary LVN sits on a wall between humps — never inside one.
16. **Extreme anatomy has three outcomes, and the ledge is the one B7 missed.** A *taper* is a
    progressive fall-off away from a fat node, "parabolic… or you can also have a 45 degree
    taper… a lack of accumulation As you move away from the high volume node" (#113). An
    *exhaustive node* is a spike, a build, then "it immediately steps off" (#119, B7). A
    *ledge* is neither: "we have a volume build and then we basically have a flat line let it
    smack you in the face" (#120) — a stack of near-equal bars where the auction simply
    stopped, "it's not finished it's not finished" (#121), i.e. the `unfinished` case. It is
    meant to be obvious: "you shouldn't have to squint your eyes to see it" (#120).

## C. Visual configuration of the profile / chart

- Profiles displayed to the right of the candles: "looking at this overall in the profile
  on the right" (#83). Leg-to-leg is a separate, sometimes manually drawn profile
  (06-30 :72–78).
- A faint line marks the prior POC on the profile (#67); a red line on the 30-min bar is the
  volume POC (04-30 :8–10).
- Tick compression: "this is set on a four tick compression in order to match the DOM"
  (07-17 :141–147) — stated for the pull-stack/POC-flip study; **no explicit ticks-per-row,
  bar-vs-letter, or row-count statement for the volume profile exists in the corpus.**
- Execution bars: "10,000 volume candles on NQ" with delta map (07-17 :121–122); "a 500
  volume based candle on NQ" (04-08 :337–338); ES "either 1,000 or 2,000" (04-08 :403–408).
- Layout: ES left, NQ middle, DOM right (04-24 :92–94). He reads candles with wicks over the
  profile (06-26 :565–567).
- Philosophy: "keep your charts relatively naked. Keep only what you want to see. Your MGI,
  your zones… I gravitate towards the JBAs and auto plot" (04-08 :778–786); "I utilize
  volume profile to see where we're at within the distribution" (06-26 :800).
- Preps are narrated zoomed-in on the JBA boxes over the profile ("We zoom in…", #24, #4).

## D. Counterexamples and preferences (the negative set)

1. **Build quality overrides nearest-first.** #20: the disliked 5-day build is traded only
   because MGI confluence stacks there.
2. **Nearer 4-hour LVN beats the farther primary.** #4/#5.
3. **LVN inside value / POC central — no trade.** #97, #98.
4. **Leg-to-leg LVNs and skip volume are de-weighted.** #61, #83.
5. **Unfinished build = the LVN above is an offer, not a bid.** #65, #72.
6. **No exhaustion, no counter at the LVN.** 07-23: "I'm not too interested in bidding this
   immediately… We would need to absolutely show a fail and exhausted look down below."
7. **A large LVN is a traverse, not a barrier.** #2, #105, #29.
8. **Entry at the JBA build, LVN only as the risk reference.** #106.
9. **Thin gap noted but deferred.** #26.
10. **Which of several is most prominent cannot always be eyeballed.** #76.
11. **Small HVN under the LVN is a warning, not support.** #80.
12. **A newer LVN does not displace the initiation LVN as primary.** #54.

## E. Coverage

Read in full: all 25 transcripts; `README.md`, `jba-prep-video-notes.md`,
`jba-analysis-process.md`, `execution-notes.md`, `execution-process.md`;
`reference/job-pivots-deep-dive.txt` (lines 60–376); `reference/ofl-101-time-and-sales.txt`
(hit context); `reference/volume_profile_101.txt` in full (added 2026-08-30 — sections A4 and
B13–B16). Replays read at every LVN/HVN/node/profile hit with context: 04-08, 04-24,
04-30, 05-04, 05-19, 05-28, 06-26, 06-30, 07-17. No Job-specific LVN content in the
Dominator / DOM / time-and-sales references. Unresolved garbles: "PAC up high" (02-13,
probably POC), "previous week's fiery high" (03-17), "OVN" in 06-22, "POSA" (06-26).
