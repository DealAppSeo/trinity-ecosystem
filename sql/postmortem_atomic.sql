
-- RPC Function for Atomic Prediction Postmortem Updates (v3.33)
-- This ensures all 5 tables are updated in a single transaction.

CREATE OR REPLACE FUNCTION process_prediction_postmortem(
    p_cycle_id UUID,
    p_asset TEXT,
    p_correct_1h BOOLEAN,
    p_correct_4h BOOLEAN,
    p_correct_24h BOOLEAN,
    p_composite_score DECIMAL,
    p_operator_id TEXT DEFAULT 'Auto-Postmortem'
) RETURNS VOID AS $$
DECLARE
    v_regime TEXT;
    v_signal RECORD;
    v_hunch RECORD;
    v_obs_count INTEGER;
    v_accuracy FLOAT;
BEGIN
    -- 1. Get metadata from consensus
    SELECT regime_type INTO v_regime 
    FROM prediction_consensus pc
    JOIN prediction_regimes pr ON pc.regime_id = pr.id
    WHERE pc.cycle_id = p_cycle_id;

    -- 2. Insert into prediction_outcomes
    INSERT INTO prediction_outcomes (
        cycle_id, 
        asset, 
        directional_correct_1h, 
        directional_correct_4h, 
        directional_correct_24h, 
        composite_score,
        outcome_recorded_at
    ) VALUES (
        p_cycle_id, 
        p_asset, 
        p_correct_1h, 
        p_correct_4h, 
        p_correct_24h, 
        p_composite_score,
        NOW()
    );

    -- 3. Update agent_accuracy_matrix for each agent in signals
    FOR v_signal IN SELECT agent_id, modality FROM prediction_signals WHERE cycle_id = p_cycle_id LOOP
        -- Increment observations and correct count
        INSERT INTO agent_accuracy_matrix (agent_id, regime_type, asset, modality, observations, correct_predictions)
        VALUES (v_signal.agent_id, v_regime, p_asset, v_signal.modality, 1, CASE WHEN p_correct_4h THEN 1 ELSE 0 END)
        ON CONFLICT (agent_id, asset, regime_type, modality) DO UPDATE SET
            observations = agent_accuracy_matrix.observations + 1,
            correct_predictions = agent_accuracy_matrix.correct_predictions + (CASE WHEN p_correct_4h THEN 1 ELSE 0 END),
            last_updated_at = NOW()
        RETURNING observations INTO v_obs_count;

        -- Calculate accuracy
        SELECT (correct_predictions::float / observations::float) INTO v_accuracy 
        FROM agent_accuracy_matrix 
        WHERE agent_id = v_signal.agent_id AND asset = p_asset AND regime_type = v_regime AND modality = v_signal.modality;

        -- Update accuracy rate
        UPDATE agent_accuracy_matrix SET accuracy_rate = v_accuracy 
        WHERE agent_id = v_signal.agent_id AND asset = p_asset AND regime_type = v_regime AND modality = v_signal.modality;

        -- 4. CONDITIONAL ANFIS WEIGHT UPDATE (Requirement: Min 10 observations)
        IF v_obs_count >= 10 THEN
            UPDATE agent_accuracy_matrix 
            SET anfis_weight_current = v_accuracy, -- Simplified weight update
                last_weight_update = NOW()
            WHERE agent_id = v_signal.agent_id AND asset = p_asset AND regime_type = v_regime AND modality = v_signal.modality;

            INSERT INTO anfis_weight_history (agent_id, regime_type, asset, weight_after, trigger_cycle_id, trigger_reason, exploration_method)
            VALUES (v_signal.agent_id, v_regime, p_asset, v_accuracy, p_cycle_id, 'THRESHOLD_MET', 'EPSILON_GREEDY');
        ELSE
            INSERT INTO anfis_weight_history (agent_id, regime_type, asset, weight_after, trigger_cycle_id, trigger_reason, exploration_method)
            VALUES (v_signal.agent_id, v_regime, p_asset, NULL, p_cycle_id, 'INSUFFICIENT_DATA — weight unchanged', 'STATIC');
        END IF;

        -- 5. Update agent capability score in registry
        UPDATE trinity_agent_registry
        SET reputation_score = reputation_score + (CASE WHEN p_correct_4h THEN 0.02 ELSE -0.01 END)
        WHERE agent_name = v_signal.agent_id;
    END LOOP;

    -- 6. Update HIAS (Human Intuition Accuracy Score) - Requirement 6
    SELECT * INTO v_hunch FROM hitl_hunch_log WHERE cycle_id = p_cycle_id LIMIT 1;
    IF v_hunch.id IS NOT NULL THEN
        -- Evaluate hunch
        UPDATE hitl_hunch_log SET
            hunch_was_correct = (human_decision = 'APPROVE' AND p_correct_4h) OR (human_decision = 'REJECT' AND NOT p_correct_4h),
            hunch_added_value = (human_decision = 'REJECT' AND system_signal = 'APPROVE' AND NOT p_correct_4h) OR 
                                (human_decision = 'APPROVE' AND system_signal = 'REJECT' AND p_correct_4h),
            outcome_recorded_at = NOW()
        WHERE id = v_hunch.id;

        -- Update human_intuition_scores
        INSERT INTO human_intuition_scores (operator_id, hunch_category, regime_type, asset, total_hunches, correct_hunches)
        VALUES (v_hunch.operator_id, v_hunch.hunch_category, v_regime, p_asset, 1, CASE WHEN (v_hunch.human_decision = 'APPROVE' AND p_correct_4h) OR (v_hunch.human_decision = 'REJECT' AND NOT p_correct_4h) THEN 1 ELSE 0 END)
        ON CONFLICT (operator_id, hunch_category, regime_type, asset) DO UPDATE SET
            total_hunches = human_intuition_scores.total_hunches + 1,
            correct_hunches = human_intuition_scores.correct_hunches + (CASE WHEN (v_hunch.human_decision = 'APPROVE' AND p_correct_4h) THEN 1 ELSE 0 END),
            hias_score = (human_intuition_scores.correct_hunches + (CASE WHEN (v_hunch.human_decision = 'APPROVE' AND p_correct_4h) THEN 1 ELSE 0 END))::float / (human_intuition_scores.total_hunches + 1),
            updated_at = NOW();
    END IF;

EXCEPTION WHEN OTHERS THEN
    -- Log failure to prediction_postmortems
    INSERT INTO prediction_postmortems (cycle_id, lesson_summary, human_postmortem_notes)
    VALUES (p_cycle_id, 'FAILED: ' || SQLERRM, 'Atomic transaction rolled back');
    RAISE EXCEPTION 'Postmortem atomic failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;
