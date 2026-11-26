CREATE TABLE brief_dismissals (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    finding_id UUID NOT NULL,
    PRIMARY KEY (user_id, finding_id)
);
