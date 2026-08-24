# HireGio design system

Not invented. Every token below was measured off metaview.ai, juicebox.ai and
reval.site with `getComputedStyle`, then reduced to their common denominator.

## Ground rules

These are hard constraints, not preferences:

- No icon libraries. The only SVG on the page is the brand wordmark and three
  hand-drawn social marks, all at 1.6 stroke on a 24 grid.
- No emoji anywhere.
- No gradients except the WebGL wave background and its no-WebGL fallbacks.
- No em dashes, en dashes as separators, non-breaking or narrow spaces, or
  zero-width characters. Plain comma, colon, period, or hyphen.
- Hairline 1px borders instead of shadows. Two exceptions: the hero product
  frame, and the header pill, where a hairline alone cannot separate a
  translucent bar from the text sliding underneath it.
- One accent colour. It appears on the CTA, links, step numbers and match scores.
  Nowhere else.

## Colour

| Token | Value | Job |
|---|---|---|
| `--bg` | `#FBFAF7` | page ground, warm cream |
| `--bg-alt` | `#F3F1EC` | alternating section band |
| `--surface` | `#FFFFFF` | cards and mockups |
| `--ink` | `#17191B` | primary text |
| `--ink-2` | `rgba(23,25,27,0.68)` | body and lead text |
| `--ink-3` | `rgba(23,25,27,0.62)` | labels, captions, timestamps |
| `--line` | `#E5E2DA` | every hairline |
| `--accent` | `#1E6B4E` | CTA, links, step numbers |
| `--dark` | `#0F1F19` | the one dark band |
| `--signal-no` | `#A8442E` | only inside product mockups |

Both grey tiers are held above WCAG AA 4.5:1 on `--bg-alt`, the darkest ground
either sits on: `--ink-2` gives 5.76:1, `--ink-3` gives 4.73:1. The step between
them is small by necessity, so the label tier separates itself with uppercase,
0.1em tracking and smaller size rather than with colour alone.

## Type

DM Sans, the same face reval.site uses. Metaview (Euclid Circular A) and
Juicebox (Roobert, Haas Grot) are licensed, so they were not options.

| Role | Size | Weight | Tracking |
|---|---|---|---|
| h1 | clamp(38px, 6vw, 88px) | 500 | -0.035em |
| h2 | 48px | 500 | -0.025em |
| h3 lead | 26px | 500 | -0.01em |
| h3 base | 21px | 500 | -0.01em |
| lead | 21px | 400 | -0.01em |
| body | 17px | 400 | normal |
| eyebrow | 12px | 500 | 0.1em, uppercase |

h3 has exactly two tiers. `--h3-lead` heads a full section row, `--h3-base`
labels a card or a plan. Running prose is capped at 62ch so lines land between
45 and 75 characters.

## Space and shape

Container 1280px, gutter 40px, section rhythm 144px desktop and 88px under
900px. Radii come from one ladder and nothing sits outside it:
`--r-card` 18, `--r-md` 12, `--r-btn` 10, `--r-sm` 6, `--r-xs` 4, `--r-tag` 999.

Every interactive target is at least 44px in its smaller dimension.

## Space

One unit, one ladder, and every margin, padding and gap on the page is a rung
of it. Nothing declares a spacing value of its own; `tests/paging.spec.js`
fails the build if a raw pixel value appears in a `margin`, `padding` or `gap`.

```
--u: clamp(6px, 0.9vh, 8px)
--s05 4   --s1 8   --s15 12  --s2 16  --s3 24  --s4 32
--s5  40  --s6 48  --s8  64  --s10 80 --s12 96 --s18 144
```

The unit is 8px on any screen at least 890px tall, which is where the ladder
reads as the plain 8, 16, 24, 32 series everything here was measured as. On a
shorter screen it drops to about 6.8px, and because every rung derives from it,
the whole page compresses in proportion: the ratio between any two spacings is
identical at every viewport height. A short window looks like the same design,
tighter, rather than like a different one.

Four rungs are named by job so a section is never tempted to pick its own
number: `--pane-pad` 40 (nav to the first line of a screen), `--head-gap` 48
(section head to the body under it), `--section` 144 (the stacked rhythm where
the page does not page), and the two measures `--measure-head` 760px and
`--measure-prose` 62ch.

Two interactive sizes are named for the same reason: `--tap` 44px and `--mark`
23px. The social row's negative offset is `(--mark - --tap) / 2`, so the one
optical nudge on the page states where it comes from.

## Alignment

The page has one centre line and everything hangs on it. A section head centres
its text inside `--measure-head`; the grid under it runs the full container
width, which is symmetric about the same axis. The only things that stay left
aligned are the insides of a card, a table row or a mock, where prose and
columns have to start on a common edge to be readable. There is no third case.

Vertically, content is anchored to the top of its screen and never centred in
it. Centring was what made the page feel arbitrary: with sections carrying
between 330px and 750px of content, a centred screen put every heading at a
different height, so paging moved the eye up and down at random. Top-anchored,
every screen opens with an eyebrow on one line and a heading on the next, at
the same two offsets, and only the body below them changes.

The hero is the one exception, and it is the only one. Every other screen
aligns to the screen before it, which is what makes a fixed heading line worth
having. The hero has nothing before it: the reader arrives cold and the eye
lands mid screen, not under the nav. So its headline group takes the space
above the trust strip and centres in it, which lands it about 5% over true
centre. Tests pin the exception as tightly as they pin the rule, so neither can
drift into the other.

The h1 is also the one type size that scales with the viewport rather than
stepping at a breakpoint, because it is the only line with a whole screen to
itself. `6vw` holds "Your recruiting team, multiplied." on a single line from
1100px up, and the 88px cap stops it outgrowing the container.

Because a screen is a fixed height and its content is not, the slack lands at
the bottom. That is the trade: an uneven bottom edge in exchange for a heading
that never moves. Where a section has a strip that belongs on the fold, it uses
`.pane-foot`, which pins to the bottom under a hairline. The hero uses it for
its logo band. The customers screen carried a second one for "Built for" until
that moved into the hero as chips, so there is one left; the class stays
because a strip on the fold is a shape this page has, not a one-off.

## Paging

The page reads one section at a time. Each `.pane` is one viewport tall minus
the sticky header and the scroll snaps to the pane top, so a section is either
fully in view or not in view.

Three rules hold it together:

1. **min-height, never height.** A pane that cannot hold its content grows
   rather than clipping it. Nothing on this page can be cut off by the fold,
   whatever a reader's window, zoom level or font fallback does.
2. **Paging is gated on fit, not on taste.** `scroll-snap-type` and the pane
   min-height only exist inside `@media (min-width:1100px) and
   (min-height:760px)`. Below that the panes revert to the stacked `--section`
   rhythm. Every pane fits inside 1100x760 with at least 43px to spare.
3. **The ladder compresses, the columns do not.** Vertical rhythm scales with
   the unit; the 1280px container, the 40px gutter and every column width stay
   where they were measured.

`--nav-h` is the single source for the header height. It drives the header's
own height, the pane min-height and `scroll-padding-top`, which is what lands
an anchored section flush under the nav rather than behind it.

`scroll-behavior` stays at its default. Snap supplies its own easing on wheel
and key scrolls, and a smooth anchor jump from the hero to the FAQ animated
through nine panes before arriving.

### What one section per screen cost the content

Sections do not divide evenly into screens, and a screen that opens like every
other screen needs a head of its own. Both forced re-cuts:

- The four **how it works** steps were one 2280px section with a single head.
  They went to a screen each, which is the cut this rule asks for and was the
  wrong one: see "How it works" below. They are one screen again, and the head
  is the standard head, with the step title as the h2 and the h2 changing as
  the step does.
- The **four agent cards** are two screens of two. The second screen had no
  head, so it takes the section's old lead as its heading: "Switch on one, or
  all four."
- The **final CTA** had no eyebrow or heading and gained one, "Get started", so
  that every screen opens the same way. The product frame gained one too before
  it was deleted outright; see below.
- The **logo band** and the **built for** row were 220px and 265px of content
  in screens of their own. The logo band is now a `.pane-foot` strip on the
  hero; "Built for" is a chip row inside the hero, which is where reval.site
  puts the same list.
- The **FAQ** runs in two columns above 1100px. Seven stacked questions were
  800px on their own.
- The **reports** mock lost its fourth bar and the **product shell** its fifth
  candidate, so that every mock on the page shows three or four rows rather
  than one showing five.

The band alternation survives all of it, and breaks only where consecutive
screens are deliberately one section: the two agent screens.

The **footer** is the one block that does not want a screen to itself. It snaps
to the bottom of the document instead of to its own top, so the last stop shows
the tail of the FAQ and the whole footer together.

## Why it was scrolling badly

It felt like ten frames a second. Measured at 1512x945, wheeling the whole page:

| | p95 frame | worst | frames over 32ms |
| --- | --- | --- | --- |
| before | 66.7ms | 216ms | 26 of 173 |
| **after** | **18.2ms** | 66.6ms | **3 of 226** |

The gradient-waves field was the entire cost. Removing the canvases took every
dropped frame with them; removing the header's `backdrop-filter` changed
nothing, which is worth recording because a blurred sticky bar is the usual
suspect and here it was innocent.

Four things fixed it, in order of how much they bought.

**The buffer was rendering at dpr 2.** This is a raymarched field: every device
pixel walks the plasma up to `steps` times, so cost is fragments times steps and
the buffer scale squares it. At dpr 2 on that window it was 3024x1736 fragments
walking 70 steps each, roughly 370M plasma evaluations a frame. Capping the
buffer at dpr 1 divides the fragment count by four. The field is a soft blurred
gradient with no edge anywhere in it, which is exactly the kind of image that
survives being upscaled by the compositor; side by side at 2x there is nothing
to see. Steps came down with it, 70 to 52.

**There were two full-viewport GL contexts.** The dark CTA section had its own
field, and it was responsible for a reproducible 133 to 150ms hitch while
scrolling into the *pricing* screen, one section earlier. Isolated: with only
the hero's field the worst frame was 66ms and only at load; with only the CTA's
it was 150ms mid-page. That section is a headline and two buttons, so it now
uses `.gw-fallback`, the CSS radial the page already ships for devices without
WebGL. Same picture, drawn by the compositor instead of a shader.

**A stopped canvas is still a layer.** Halting the loop off screen was already
in place, but the element stayed in the layer tree holding a full-viewport GPU
texture, and that alone cost a reproducible 166ms hitch on the agents screen
with both fields idle and nowhere near the viewport. The intersection observer
now sets `visibility` as well as stopping the loop. `visibility`, not `display`,
because `display:none` would collapse the host and the hero's layout depends on
it filling the section.

**Nothing is drawn while the wheel is moving.** A passive scroll listener stops
the loop and restarts it 180ms after the last event. The field drifts at 0.1 of
real time, so freezing it for the length of a gesture is invisible, and the page
snaps, so the reader is at rest almost all the time anyway. The listener is
removed in `destroy()`, or a context-loss cycle would leak it, which is the bug
that block already exists to prevent.

On top of those, the draw is paced to 32ms rather than every frame. The clock
still advances on every rAF so the motion stays smooth in time; only the draw is
halved. The existing auto-downgrade had to be re-based on that pace, or the cap
would read as slowness and downgrade on the first check every time.

Four tests hold this: one WebGL context on the page, a buffer no larger than one
device pixel per CSS pixel, an off-screen field that leaves the layer tree, and
a scroll that keeps dropped frames under 8%.

## The phone

A sweep from 320px to 900px found no sideways overflow, no clipping, no
overlapping blocks and no ink escaping the viewport. Two things did need
fixing.

**Every mock ran off the right edge.** They carried `min-width: 460px`, 400px
inside a card, and sat in an `overflow-x: auto` scroller, so on a 390px screen
50 to 110px of each one was off screen: names cut mid word, "LinkedIn" ending at
"LinkedI". The page itself never scrolled sideways, which is why no test caught
it, but a card whose text runs off the screen reads as broken whatever the
overflow rule says.

Below 640px the mocks give up their minimum and their rows reflow instead.
Nothing is deleted. A candidate row becomes avatar, name and score on the first
line with the source and the accept/pass buttons on their own line underneath,
which is where they belong on a screen that size; the report bars narrow; the
log's third column drops under the second; the mock head's two spans take a line
each rather than meeting in the middle. A test asserts no mock overflows its
container and no scroller is left holding hidden content, at five phone widths.

**One tap target was under the rule.** The card "Learn more" link was 41px
against the page's stated 44px. Fixed the way the criteria chips already do it,
by growing the hit area past the ink rather than drawing the link bigger.

### The phone had the desktop's vertical rhythm

The ladder is derived from `--u`, and `--u` is `clamp(6px, 0.9vh, 8px)` — it
answers to viewport **height**. A phone is tall, so `--u` lands at 7.6 against
the desktop's 8, and every gap on the page arrived on a phone at 94 to 96% of
its desktop value while the type arrived at 41%. That is the textbook tell:
vertical rhythm inherited at 1:1 rather than re-derived for the smaller surface.

Measured before and after, at 390x844:

| | before | after | desktop |
| --- | --- | --- | --- |
| section padding | 61 | **76** | 144 (non-paging) |
| eyebrow to headline | 30 | **38** | 32 |
| headline to lead | 30 | **38** | 32 |
| lead to buttons | 46 | **61** | 48 |
| figure to trust strip | **0** | **38** | 159 |
| mascot soles to strip type | **4** | **80** | 147 |

Section padding is now `--s10`, half the desktop `--s18`, which is where
measured design systems land for inter-section rhythm on a phone: the
University of Maryland system runs 120 / 80 / 56px desktop to tablet to mobile,
mobile at 47% of desktop. The gutter drops much harder, to 20px, because an
outer margin fights the column for width and a section gap does not. Two
variables, two different rates.

**The collision.** The mascot's box ended exactly where the trust strip began,
and his soles cleared its first line of type by 4px, so "Trusted by teams
hiring at speed" ran through his legs. The negative margin that grounds him on
a desktop, breaking his soles into the hero's bottom padding, has nothing to
break into on a phone because the strip starts immediately underneath. On a
phone he keeps his own space instead: `--s6` above, `--s5` below, no overlap.

### The hero is allowed past the fold now

It used to be asserted at one screen. It is 1.29 to 1.44 screens on the phones
tested, and that is the design rather than a regression: the rhythm above is
deliberately airy and a figure now stands under the buttons.

Fitting one screen was only ever a proxy for the thing that actually matters,
so the test measures that directly instead. Everything down to and including
**both buttons is above the fold** at every phone size; the hero may run past it
for the mascot and the strip; it is bounded at 1.75 screens so it cannot run
away; and the rhythm itself is pinned, with a heading further from its paragraph
than its own lines are from each other, and an action further still.

### The headline was stuck on its floor

`min(7.4vw, 15vh)` does not reach the 34px clamp minimum until about 460px
wide, so every phone from 320px to 430px got the identical 34px payoff and 19px
setup. The type did not answer the screen at all, and 19px is exactly what the
lead under it was set at, so the hero was three near identical lines stacked
with no order between them:

| | 360px | 390px | 430px |
| --- | --- | --- | --- |
| payoff, before | 34 | 34 | 34 |
| **payoff, after** | **40** | **43** | **47** |
| setup, after | 19 | 21 | 23 |
| lead, after | 17 | 17 | 17 |

Below 640px the pair takes its own scale, steeper than the desktop one because
a phone has far less width to spend and the payoff has to earn its line, and
the lead steps down to 17px so the order reads: payoff, setup, lead, body, each
visibly smaller than the last. A test walks five phone widths and asserts all
four steps, that the payoff never wraps, that it stays inside the measure, and
that the widest phone gets a bigger headline than the narrowest.

### The hero drop is gated above the phone

The `padding-bottom` correction that stops the headline drifting into the middle
of a tall window was firing on phones too, where it opened a 289px band of
nothing between the buttons and the trust strip on a 400x1100 screen. It is a
correction for a window that is tall *relative to its content*, and a phone hero
is one screen either way.

It is now gated on `min-width: 641px` rather than on the paging query, because a
900x1200 tablet has the same problem a desktop does and is nowhere near paging.
Below that the hero simply centres, and a test asserts the drop is exactly zero
and the two gaps match within 2px at three phone sizes.

## The buttons

They were a slab of colour with a label floating in the middle. Three things
answer that, and all three are present **before anything is hovered**, because
most traffic never hovers at all and a treatment that only pays off on hover has
answered half the brief.

Five treatments were built and rendered against the real page, then judged on
three lenses: the client's own words, restraint, and the motion itself. All
three judges picked the same one, and two of the three proposed the same graft.

**An edge.** A 1px inset rim on the filled pills, so a fill reads as an object
rather than a printed rectangle of green.

**A ground.** A 1px contact line under every button. The offsets are a ladder,
and the ladder is what lets the button move without the page moving with it:

| | lift | contact offset | sum |
| --- | --- | --- | --- |
| rest | 0 | 1px | 1 |
| hover | −1px | 2px | 1 |
| press | +1px | 0 | 1 |

Lift plus offset is 1 at every state, so the contact line never leaves the
ground plane; the button moves against it. The lift is gated on
`@media (hover:hover)`, or a tap would leave a phone's button parked a pixel
above its own line. A press owns a shorter duration than the rise, because a
press is an event and not a second hover, and on touch it is the only state that
ever fires.

**A mark.** A hairline ring with an arrow in it, at the trailing end of the
filled buttons.

It is not a new shape. `.hiw-node` is already a `--r-tag` circle carrying a 1px
hairline, and it is already this page's sign for "a step you can go to"; the
button's mark is that node shrunk to fit inside a capsule. The arrow is drawn to
the footer icons' spec, 24 viewBox, stroke 1.6, round cap and join, no fill.

Only the **filled** buttons carry it. A ghost already has a drawn edge, so a
hairline ring inside a hairline border reads mushy at 20px, and every button on
this page appears in a pair: one mark per row keeps the row a choice rather than
two identical doors. In the pricing row this does real work, marking the
recommended plan between two bare ghosts with no extra styling.

**One pseudo element, not two.** The obvious build is a masked arrow over a
box-shadow ring, and it does not work: CSS masking eats the element's own
box-shadow, so the ring vanishes. So the ring is the `::after`'s box-shadow and
the arrow is its background-image, and both travel together in flow at every
width. A background-image cannot read `currentColor`, which is the one cost: the
arrow is drawn twice, once white and once in `--dark`.

The travel is a three-cell background, arrows in the first and the last, moved
two cells on hover. The empty middle cell is the point: without it two half
arrows share the round aperture mid travel and the motion reads as a smear
rather than a mechanism.

**Nothing here is a drop shadow.** Every line added has 0 blur and 0 spread, so
the page still has exactly one drop shadow, on the header pill. Every curve is
one the page already owned: `.35s cubic-bezier(.4,0,.2,1)` for the arrow's
travel, `.2s ease` for the rings, `.15s ease` for the press,
`.3s cubic-bezier(.16,.7,.3,1)` for the lift.

Under `prefers-reduced-motion` the global block zeroes every duration and no
second block was needed. The resting edge, ground and mark are untouched, which
is the whole answer to "they look completely empty"; only the travel between
states stops being a journey.

### The focus ring used to square off the pills

Found while building this. `:focus-visible` set `border-radius: 2px` alongside
its outline, and because it sits after `.btn` at equal specificity it overrode
the pill radius for as long as a button held keyboard focus: a global rule
imposing one shape on elements that declare their own. An outline follows
whatever radius the element already has, so nothing needed it. Removed.

One thing worth knowing for anything added later: the page draws keyboard focus
as `outline: 2px solid var(--accent)` at `outline-offset: 3px`. That geometry is
spoken for. A resting decoration at the same colour, offset and weight will make
every element look permanently focused, which is exactly how one of the five
treatments lost.

## Gio, and the two column hero

The mascot arrived as a file named `.png` that was a **JPEG**: three components,
zero alpha, and a transparency checkerboard rendered into the pixels as literal
grey and white squares. Measured, the top edge alternates `217,219,218` and
`255,255,255` on a regular grid, and the whole frame contains not one
transparent pixel. It is a screenshot of a transparency preview, not a
transparent export.

Unlike the render it replaces, though, it keys perfectly: dark charcoal against
two light greys is an enormous separation. `scripts/key-mascot-v2.cjs` floods in
from the frame edge rather than thresholding, so light detail inside the
character survives whatever its brightness, then ramps the alpha between two
luminance thresholds and replaces the colour of every partial pixel with the
average ink, so a soft edge reads as half of Gio rather than half of the
checkerboard he was shot against.

| | old render | this one |
| --- | --- | --- |
| interior holes | 1463 | **33** |
| soft edge | 2.38% grey fringe | **1.28%**, decontaminated |
| silhouette | chewed, boots cut off | clean |

`mascot.png` sits beside `index.html` as the source of truth, at 920x1522, which
is twice the 460px the page ever displays. The page carries it inline as a 176KB
webp data uri rather than linking it, for the reason the file has always given:
this page's whole distribution model is that it is ONE file, and a regression
test asserts no `src` points anywhere but `data:` or Google Fonts.

**The hero is two columns above 769px.** Copy left at 55%, Gio right at 45%,
vertically centred against each other. He waves with his left hand, which on
screen points back across the fold at the headline and the buttons, so the
gesture runs inward. This is the one place on the page that gives up the centre
line, and it is deliberate: the alternative is a waving figure gesturing at
nothing.

Three things had to move to make room for him:

- **The headline came down from 108px to 86px.** The copy column measures 634px
  at `--maxw` and never grows past it, so the payoff wrapped. At 86/33 each
  sentence is back on one line inside that measure, holding the same 2.5x
  interval and the same near matched widths, 592px of payoff under 616px of
  setup.
- **The hero drop went from 0.85 to 0.55.** That factor was tuned when the hero
  was four lines of text in a wide empty field; a figure filling the second
  column is most of the answer to that on its own. Measured across 760 to
  1600px of window height, 0.55 holds the top of the hero row 62 to 95px under
  the nav with nothing overflowing. 0.35 let it drift to 171, 0.7 squeezed it
  to 34.
- **He is capped on both axes.** `max-width: 460px` and `max-height: 54vh`, with
  `width: auto`, so the browser fits him to whichever is tighter. The height cap
  is the one that matters: this page guarantees the hero ends on the fold, and
  at 460px wide he is 761px tall against roughly 713px of hero to stand in.

**Grounding.** The render has no shadow, so he would hover. Two marks fix it,
and both are adapted rather than taken as briefed, because the brief described
a dark monochrome page and this one is cream:

- a **contact shadow**, `--ink` at 0.20 falling to nothing, 60% of his width and
  blurred. The brief asked for black at 35%; this page carries exactly one real
  shadow and it is 6% ink, so 35% black would be the heaviest mark on the page
  by a factor of five.
- a **bloom** behind him, `--accent` at a tenth strength. The brief asked for a
  cool grey-white spotlight, which is what a dark page wants; white on `#FBFAF7`
  is four units of lift and reads as nothing at all. The accent does read, and
  it is the same green already in the gradient-waves field behind it. No new
  colour.

**Motion.** He floats plus or minus 6px over 6s on ease-in-out, and the contact
shadow answers in counter phase, scaling 0.95 to 1.0, so it tightens as he rises
and spreads as he settles. The page's global reduced-motion block already zeroes
every duration; there is an explicit guard as well, which parks him at rest
rather than mid float.

**On a phone the hero stacks**: copy, buttons, then Gio centred underneath at
70% width capped to 24vh, standing on the hairline above the trust strip. He
costs the phone hero about a tenth of a screen of height, and the one-screen
rule became the bounded overflow its own comment always described, rather than
an exact fit. The alternative was a mascot too small to be worth showing.

## The hero headline

Two sentences doing two jobs, so they are set as two lines at two sizes rather
than one paragraph left to wrap. As one `.h1`, `text-wrap: balance` broke it
after "your" — a noun phrase split in half, and the sentence boundary landing
in the middle of a line.

| | size | colour | job |
| --- | --- | --- | --- |
| `.h1-setup` | `clamp(19px, 2.95vw, 43px)` | `--ink-2` | states the problem |
| `.h1-payoff` | `clamp(34px, 7.4vw, 108px)` | `--ink` | answers it |

A 2.5x interval, which is the whole hierarchy: the line that reassures is the
line that lands. Seven directions were rendered against the real page and
judged; this one won on every lens.

**The sizes are tuned against each other, not chosen separately.** They are the
numbers that bring the two lines out to nearly the same width, so the pair reads
as one rectangular block rather than a lopsided pyramid. At 1440 they measure
758 and 734. The earlier version of this idea, at 0.62x, put a 940px grey line
over a 593px black one and the payoff read as *less* despite being bigger.

The block always tapers the same way — grey line wider, payoff just inside it —
and a flare is the failure case, because a payoff wider than its setup makes the
setup read as a caption hanging above a slab. The gap is not constant and is not
meant to be: DM Sans is variable on `opsz`, so the setup uses a wider optical
design at 32px than at 43px, while the payoff is past the axis maximum and
scales linearly. Measured, the taper is 23px from 1440 up and opens to 49px at
the 1100 gate. A test pins the direction and the bound.

**Not the accent green**, though it was tried both ways. Green means
"interactive or affirmative" everywhere else here, so a green headline stacks a
second, larger green mass directly above the green primary button and neither
reads as the thing to click. It also has less contrast on cream than `--ink`, so
it would render *lighter* than the line it is meant to outweigh. The test asserts
the payoff stays in ink.

The gap between the lines is `0.06em`, not a rung of the spacing ladder, and
that is deliberate: it is leading, so it has to scale with a font size that is
itself a clamp. The ladder is for layout rhythm.

On a phone the setup takes two lines and the payoff stays on one. The hero
still ends exactly on the fold.

### The hero fills the screen it is given

Cutting the microline and the chip row left the headline group floating: the
hero centres its content above the trust strip, so with less to centre, both
voids grew. Measured, before the fix:

| window | content | above / below | content share |
| --- | --- | --- | --- |
| 1440x900 | 368px | 144 / 144 | 56% |
| 1512x945 | 370px | 165 / 165 | 53% |
| 1920x1200 | 370px | 293 / 293 | **39%** |

Two separate causes, and both needed fixing.

**The type stopped growing and the space did not.** `.h1` was capped in `vw`
alone, so past about 1460px the headline froze at 108px while the window kept
getting bigger. Both lines now answer to whichever axis is tighter —
`clamp(34px, min(7.4vw, 15vh), 148px)` on the payoff and the same shape at
0.3986 of it on the setup, which is what keeps the 2.5x interval and the
matched line widths intact at every size. `min()` is the important part: the
`vh` term protects short windows, where the old `vw`-only rule would have
overflowed, and the `vw` term still governs wide ones, because line length is a
width problem. The `.hero .lead` scales with it, or a 148px headline sits on a
21px line and the pair stops reading as one block.

**Centring was too literal.** The doc used to claim the hero sat "a little over
true centre"; it did not — the gap above the eyebrow equalled the gap below the
buttons exactly, so on a tall window the block drifted to the middle of a field
of cream and the screen read as unloaded.

The surplus now goes below the content rather than being split around it:

```
.hero-main{
  justify-content:center;
  padding-bottom:clamp(0px, calc((100svh - --nav-h - --pane-gate-h) * 0.85), --s18 * 4.5);
}
```

`padding-bottom` eats the extra height before the centring happens, which lifts
the block back up and leaves a generous gap down to the trust strip. That is
the right place for it: a strip pinned under a hairline is somewhere a large
gap reads as deliberate separation. Above the headline it reads as a mistake.
Below `--pane-gate-h` the term is negative, the clamp floors it at zero, and
the hero centres exactly as it always did.

The result is the number the tests now hold — the headline opens the same
distance under the nav on every screen the page pages at:

| window | 1100x760 | 1440x900 | 1920x1080 | 1920x1200 | 2560x1600 |
| --- | --- | --- | --- | --- | --- |
| gap above eyebrow | 93px | 97px | 78px | 87px | 117px |

The mascot is deliberately not lifted with the block. It is absolutely
positioned, so its `bottom: 0` resolves against the padding edge and it keeps
standing on the strip line where it was drawn to stand.

### What came out of the hero

The **"Works with Greenhouse, Lever, Ashby and 20 more"** microline and the
**"Built for" chip row** were both cut. The hero now runs eyebrow, headline,
lead, two buttons, and closes on the trust strip pinned to the fold.

**The buttons took the pill rung.** `.btn` was `--r-btn` (10px) and is now
`--r-tag` (999px), with the horizontal padding stepped up a rung to `--s4` so
the caps do not crowd the curve. That covers every button on the page, which is
what keeps them one component — and it puts them in the same shape family as the
header pill and the criteria chips. `--r-btn` stays in the ladder; the avatar
still uses it.

## The header

Measured off reval.site, which is where the pattern comes from. Two elements,
not one:

- **The band** (`.nav`) is `position: sticky`, transparent, and does nothing but
  hold the bar `--s2` off the top of the window. It never changes.
- **The bar** (`.nav > .wrap`) carries all the appearance and is the only thing
  that animates.

At rest the bar is invisible: no ground, no radius, no rule, just the wordmark
and the one button sitting on the page. Past 16px of scroll a `data-pinned`
attribute lands on the band and the bar condenses into a floating pill, `--bg`
at 0.92 over `blur(24px) saturate(1.8)`, so it reads as glass rather than as a
second background. 260ms, and the radius eases while the ground and shadow fade.

**The bar holds two things: the wordmark and "Book a demo".** It carried four
section links and a "Sign in" as well, and they came out. Nothing else on the
page changed to make room for it — `--nav-h` is unchanged, so every number the
paging derives from it is unchanged too. What it costs is inbound links:
`#pricing` and `#proof` are now reached only by scrolling to them, since the
footer does not list either. The footer is where they would go back.

Two details are load-bearing:

**The band keeps its full `--nav-h` height in both states.** Every number the
paging is built on derives from `--nav-h`: `scroll-padding-top`, the pane
`min-height`, the snap position of every section. A header that changed height
on scroll would move all of them, on every scroll. Only the bar's skin animates;
the box it sits in never moves. Two tests hold this.

**The hairline is a ring in the `box-shadow`, not a `border`.** A border sits
inside the box, and with `box-sizing: border-box` that pushes the logo one pixel
off the 1280px column every other element on the page is aligned to. Measured,
not theorised: it was 121 against 120 until the border came out.

The reference does two things this does not. Its bar shifts its own horizontal
padding from 8px to 24px as it condenses, which slides the logo sideways on
scroll; here the padding is `--gutter` in both states so the logo stays on the
page's content column. And its band shrinks 80px to 76px, which is harmless on
a continuously scrolling page and would not be here.

## How it works

The pattern is reval.site's, which is the strongest version of this section
among the three references. A numbered timeline runs down the left with its
track filling to the step you are on; that step's product shot sits beside it.

**What is copied:** the two-column split, the numbered nodes on a hairline
track, the fill that reports progress, the past/current/future states, and the
0.35s `cubic-bezier(.4,0,.2,1)` on every state change.

**What is not copied is the driver, and that is the whole adaptation.** Reval's
section is three viewports tall: a `position: sticky` child pins the content
for two viewports of scrolling while the active step is scrubbed from the
scroll offset, roughly 450px of scroll per step. That cannot work here. This
page is a mandatory snap container, and a pinned region inside one fights it:
the browser pulls back to the nearest snap position the moment you stop moving,
which mid-pin means being yanked to the top of the section.

The first answer was to let the paging be the driver: four screens, one step
each, since the snap already advances exactly one step per gesture. It worked
and it cost too much. The same timeline was printed four times, the reader had
to page through the section to see the section, and four of the page's eleven
screens went to one idea. Worse, the four screens made the transitions dead
CSS: a new screen simply arrived with its state already set, so the fill had
nothing to travel from and the section was four static pictures of a line, not
a line being drawn.

**So the section is one screen with a radio group in it, and the reader scrolls
it.** Checking a step is the entire state:

| What changes | How |
| --- | --- |
| The node fills, the label goes to ink | `.hiw-in:checked ~ .hiw-node` |
| The steps behind it keep the accent on the ring | `#how:has(#hiw-3:checked) .hiw-step:nth-child(-n+2)` |
| The track fills to it | `#how:has(#hiw-3:checked) .hiw-steps{--fill:2}` |
| The heading changes | `#how:has(#hiw-3:checked) .hiw-title:nth-child(3)` |
| The panel swaps | `#how:has(#hiw-3:checked) .hiw-card:nth-child(3)` |

Three things fall out of it being a radio group rather than four buttons and a
script:

- **The arrow keys already walk it.** A radio group is the one native control
  that behaves like a stepper, including the roving tab stop. There is no
  keyboard code on this page.
- **It still works with the script dead**, which is what the four screens
  bought and what one screen has to earn back. The state is in the markup and
  the look is in CSS; the script only decides which radio is checked, and from
  where the reader has scrolled to.
- **A step is a place, not a link.** They used to be anchors to `#how-2`,
  `#how-3` and `#how-4`, which no longer exist. A step now scrolls to its own
  stop inside this one section: it moves the reader without navigating,
  without writing history, and without the screen itself moving a pixel.

The floor under `:has()`: `.hiw-title:first-child` and `.hiw-card:first-child`
are visible before any of the `:has()` rules, so a browser that drops those
rules shows step one — a stepper that will not step, rather than a section
showing nothing.

### Nothing moves except the step

The four headings live in one `h2` as four stacked `span`s, and the four panels
live in one grid cell, each stack as tall as the tallest of its four. Stepping
therefore changes what the section says without changing where anything sits:
the heading holds its line, the card holds its height, the section holds its
own height, and the reader is not thrown a pixel. A test clicks all four steps
and pins all four numbers.

Hidden panels are `visibility: hidden`, never `display: none`. They keep the
space they will need, and they leave the tab order and the accessibility tree,
which matters because the first panel is full of real buttons. Transitioned
`visibility` also holds both panels visible for the length of the crossfade, so
the panel leaving does not vanish a frame before the one arriving lands.

### The scroll is the driver

The steps advance as you scroll, which is reval's actual mechanism and the one
thing this section could not have while it was four screens. Their driver is a
`position: sticky` region scrubbed from the scroll offset, and a pinned region
inside a mandatory snap container gets pulled back to the nearest snap position
the moment you stop moving.

It only fought the snap because it had nothing to snap **to**. Give the pinned
range its own snap positions and the fight goes away:

```
<section class="hiw-sec" id="how">     height: 4 x (100svh - --nav-h)
  <div class="hiw-stop"></div>  x4     absolute, one screen tall,
                                       scroll-snap-align: start
  <div class="sec pane hiw-pin">       position: sticky; top: --nav-h;
     the screen                        scroll-snap-align: none
  </div>
</section>
```

Four empty stops, one per step, each a snap position. The screen is pinned
across all four. Every place the scroll can come to rest **is** a stop, so one
gesture is one step — the same cadence as every other screen on the page — and
the heading, the panel and the track change under a screen that never moves. A
test wheels through it and asserts the pin sits at exactly `--nav-h` at all
four stops, which is where a fight between the pin and the snap would show.

The pin keeps every `.pane` rule it already had: the min-height, the padding,
the top anchor that puts its eyebrow on the same line as every other screen's.
The only thing it gives up is being a snap target itself, because the stops
behind it are the snap targets now and two of them competing for one rest
position is exactly the yank this is avoiding.

On one screen the fill finally has somewhere to travel from, so the 350ms
transition on it is doing work rather than sitting dead. A test samples it
mid-flight to prove it moves rather than jumps.

**The script does three things, and none of them is rendering.**

1. It sets `data-scroll`, which is what switches the stops on. Set here rather
   than in the markup so that with no script the section is one screen instead
   of four, three of them empty.
2. An `IntersectionObserver` at `threshold: 0.5` reads which stop the scroll is
   resting on and checks that radio. A stop is one screen tall and the snap
   lands its top under the nav, so the stop being read is the only one that can
   be more than half in view.
3. On `change` it scrolls to the matching stop. A step is a place on the page
   now, so choosing one has to travel there — otherwise the step showing and
   the place the reader is standing disagree, and the next flick of the wheel
   snaps them somewhere else. A test clicks step three, then wheels once, and
   asserts it arrives at step four rather than jumping back.

Assigning `.checked` in step 2 dispatches no `change` event, which is what
keeps 2 and 3 from chasing each other.

Two gates, and the section degrades a step at each. **Without the script** it is
one ordinary screen and the steps are chosen by hand, which is what the radios
already do. **Below the paging gate** the same, because three empty stops are
three dead screens on a page that is not paging. Both are tested.

Two details the tests hold:

- **The track spans node centre to node centre**, derived as
  `--hiw-inset: calc(var(--s3) + var(--tap) / 2)` — half a node plus the row
  padding above it. Written as `var(--tap) / 2` alone it overshot the first and
  last circle by 24px at each end.
- **`.hiw > *` and `.hiw-cards > *` need `min-width: 0`.** A grid track's
  min-width is `auto`, so the 460px `min-width` on a mock inside the card
  propagated out and made the whole page scroll sideways on a phone. Every
  other grid on this page was already in that list; these two were not.

- **The flex container is the label, not the row.** It was an anchor before and
  moving the flex to it, to make the whole step clickable, broke the mobile
  layout silently: the breakpoint still said `flex-direction: column` on
  `.hiw-step`, which was no longer a flex container, so node and label stayed
  side by side and the row wrapped. Caught by the test that checks all four
  nodes sit on one line.

The radio itself is hidden at 1px and zero opacity rather than with
`display: none`, which would take it out of the tab order and take the arrow
keys with it. The ring it would draw at that size is worth nothing, so the
page's focus ring is moved onto the node.

Below 900px the column becomes a row: four 44px nodes fit across a phone, four
labelled rows do not.

## What the product frame was, and why it went

The page used to open its second screen on a tabbed product frame: an eyebrow,
a heading, a four-tab strip and a full-width shell. It is gone, and the page is
fourteen screens rather than fifteen.

It was there because Metaview has one, which the original note on that section
said outright. Reval does not. Checked rather than assumed: reval.site is six
sections — hero, how it works, why use Reval, pricing, CTA, footer — and a
search for `role="tab"`, `[class*="tab"]` and `[class*="Tab"]` across the whole
document returns **zero elements**. Every product mockup on that site lives
inside the four how-it-works cards, which is the section this page now copies.

The deciding argument was not fidelity though, it was duplication. The frame's
four tabs were Sourcing, Candidate analysis, Outreach and Reports. The two
agents screens are Sourcing, Candidate analysis, Personalized outreach and
Reports, with near-identical mocks. How-it-works step 02 is the sourcing mock a
third time. The same four products were being shown on three separate screens,
and the frame was the one carrying the least around them.

Deleting it took the tab strip, the panel stack, the grid trick that held the
shell at the tallest panel's height, and two tests that existed only to guard
that behaviour.

### The hero's chip row

Reval puts its audience list in the hero as chips, labelled "BUILT FOR", above
the logo bar. This page now does the same, reusing the `.tag` component the
product mocks already carry rather than introducing a new shape.

It costs height on a phone, where the chips wrap to two rows. At 390px and up
the hero still holds exactly one screen; at 360x740 it runs about 8% over.
That is deliberate and the test says so: reval's own hero overflows the same
360x740 phone by 125px, nearly twice as much, and simply lets it. An exact fit
where there is room for one, and a bounded overflow on the smallest phones,
rather than a hero with its content cut to make a number true.

## The brief, made operable

The caption under the first how-it-works mock has always read "Three marked
must-have. Edit one and every agent updates." That is the only claim on the
page that is cheap to make true, so it is: the six criteria are real toggle
buttons, and the count in the caption is read from them rather than typed into
it. Press one and the sentence changes.

On top of that the import plays itself once, when the screen is reached: the
job link types into the field behind an accent caret, then the six criteria
arrive in the order they were read out of the job, 70ms apart.

The two are deliberately separate, and only the first is load-bearing:

- **The toggles run always.** No observer, no timers, no motion query. With no
  script at all the markup already carries the right answer, because the state
  lives on `aria-pressed` rather than on a class a script has to apply. A test
  loads the page with JavaScript disabled and checks exactly that.
- **The sequence is skipped entirely under reduced motion**, and it is latched,
  so scrolling away and back does not replay it.

Three details the tests hold:

- **It hands the mock back untouched.** When the last chip lands, the script
  removes every class it added. Nothing is left holding a transform, so the
  section measures the same before, during and after, and no geometry
  assertion in the suite becomes a race against a 1.3 second animation. That
  was a real bug earlier in this page's history and it is worth not repeating.
- **A chip stays 27px but its target is 57px.** The 44px rule applies to these
  as much as to anything else, so the hit area is grown past the ink with a
  `::after` rather than the chip being drawn bigger.
- **The trigger is `intersectionRatio >= 0.55`, not `isIntersecting`,** for the
  same reason as everything else on this page: three panes report
  `isIntersecting` true at every resting position, so the import would play a
  whole screen before it was on screen.

No `requestAnimationFrame`. A caret and a stagger are timers, not frames, and a
regression test bans rAF from this file.

## The content pass, and the one number that had to move

The copy and the figures now come from Ilona. The role in every mock is a real
posting, kilo.co/career/ai-software-engineer-node-js, and the six criteria were
read off it rather than invented: 1.5+ years backend, TypeScript or Node and
agentic AI tooling as must-haves, machine learning, Vilnius hybrid and
distributed systems as nice-to-haves. Everything downstream follows the same
role, so the candidate titles, the scoring criteria, the outreach draft and the
activity log all moved with it. Nothing still says Senior Backend Engineer.

One thing was changed that was not asked for, and it is worth knowing about.
The "with agents" clock read 09:12 brief approved, 09:18 profiles read, 15:40
shortlisted. That is six hours, which is what the stat above it used to say.
The stat is now "2 min from brief to first ranked shortlist", so the clock
would have contradicted it on the same screen. The times are now 09:12, 09:13,
09:14. The wording is untouched.

The headline is also two sentences now, which changed two things it is easy to
miss: it wraps to two lines from the paging gate upwards, and on a phone it was
running to four lines at the old 38px floor. The h1's minimum is 32px, which
brings that back to three. At 414px and up the hero still holds exactly one
screen; at 390 it runs 3% over and at 360 about 16%, against reval's 19% at the
same size.

## Gio

The mascot stands in the bottom right corner of the hero, on the trust strip's
hairline. He is positioned rather than in the flow, so he costs the hero no
height and the copy above him is untouched, and he is hidden below 900px where
there is no corner to stand in and the hero is already over one screen.

He arrived as a 442x864 RGB render on a black background, with no alpha, and
the page ground is cream. The transparency was cut here, by
`scripts/key-mascot.cjs`. The interesting part is why the obvious method fails.

Half the pixels in that render sit in the bottom luminance band, and they are
not all background: the sunglasses read 16, the boots 17, and the inside of the
G's aperture is pure black. A luminance threshold punches holes straight
through the character. So the script floods the background in from the frame
edge instead: only darkness CONNECTED to the outside is background, which
leaves the black inside a jacket crease or behind a lens alone.

Two numbers were found by measurement rather than picked:

- **Threshold 8.** A sweep at 4, 6, 8, 11 and 14 showed the flood escaping
  through the G's aperture and into the lenses at 11 and above, and leaving
  heavy grey residue below 6. Eight is the highest value at which the glasses
  and the jacket both survive.
- **The contact shadow is cropped, not keyed.** It fades continuously into the
  background, so nothing separates it. The cut line is found by what survived
  as opaque: in the shadow band most opaque pixels are near black, a
  material-to-opaque ratio around 0.2, while in the boot sole almost all of
  them are lit leather, around 0.9. Twenty one pixels came off the bottom.

It is a good cut and not a perfect one. There is slight light fringing along
the G's left edge that is invisible at the 200px he is used at. A transparent
export from the source file would still be better and drops straight in over
`assets/gio.png`; the script takes a path argument for the next render.
