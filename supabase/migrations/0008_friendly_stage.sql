-- Add a new stage so we can use the prediction/scoring engine for
-- international friendlies (warmup matches, testing the system before WC).
-- Because `matches.is_knockout` is a generated column (true when
-- stage <> 'group'), friendlies will accept ET + penalty predictions too.

alter type match_stage add value if not exists 'friendly';
