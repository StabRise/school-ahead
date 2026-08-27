"""Default left-border accent colors auto-assigned to Subjects that don't
have one set explicitly (see academics.services.assign_subject_color and
migration 0010_backfill_subject_color). 30 hues spaced 12° apart, alternating
L=50%/44% at S=68% so neighboring hues stay visually distinct as thin accent
bars. Order matters — migration 0010 depends on this exact sequence."""

SUBJECT_COLOR_PALETTE: tuple[str, ...] = (
    "#D62929", "#BC4224", "#D66E29", "#BC7F24", "#D6B429",
    "#BCBC24", "#B4D629", "#7FBC24", "#6ED629", "#42BC24",
    "#29D629", "#24BC42", "#29D66E", "#24BC7F", "#29D6B4",
    "#24BCBC", "#29B4D6", "#247FBC", "#296ED6", "#2442BC",
    "#2929D6", "#4224BC", "#6E29D6", "#7F24BC", "#B429D6",
    "#BC24BC", "#D629B4", "#BC247F", "#D6296E", "#BC2442",
)
