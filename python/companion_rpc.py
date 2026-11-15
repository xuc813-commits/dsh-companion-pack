"""Locked local MCP bridge. Upstream engine stays vendored and unmodified."""
import json, sys, os, math
from datetime import datetime, timezone
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'emotion-engine', 'scripts'))
import emotion_engine_utils as engine
import emotion_engine_mcp as mcp

def decay(state, policy, freeze=False):
    now = datetime.now(timezone.utc)
    for kind in ('mood', 'trust'):
        key = 'companion_' + kind + '_settled_at'
        old = engine.parse_iso_datetime(state.get(key) or state.get('last_interaction_iso'))
        hours = max(0, (now-old).total_seconds()/3600) if old and not freeze else 0
        if kind == 'mood':
            factor = math.exp(-policy['moodPerHour']*hours)
            for dim in ('pleasure','arousal','dominance'):
                baseline = state['personality_baseline'][dim]
                state['emotion'][dim] = engine.clamp_dimension(dim, baseline+(state['emotion'][dim]-baseline)*factor)
        else:
            trust=state['trust']; floor=policy['disconnectFloor']/100
            # A real conflict below the disconnect floor is never raised by absence.
            state['trust']=round(min(trust,max(floor,trust-policy['trustPerDay']/100*hours/24)),6)
        state[key] = now.isoformat()
    return state

def main():
    envelope=json.load(sys.stdin)
    state_file=sys.argv[1]; policy=envelope['policy']
    # Lifecycle calls must not apply upstream's older, repeated-from-last-interaction decay.
    engine.compute_mood_time_decay=lambda state: state
    engine.compute_trust_time_decay=lambda state: state
    if envelope.get('operation') == 'decay':
        os.makedirs(os.path.dirname(state_file),exist_ok=True)
        with engine.state_file_lock(state_file):
            state=engine.load_state_unlocked(state_file)
            state=decay(state,policy,envelope.get('freeze',False))
            engine.save_state_unlocked(state_file,state)
        print(json.dumps({'jsonrpc':'2.0','id':1,'result':{'state':engine.public_status(state)}},ensure_ascii=False))
    else:
        print(json.dumps(mcp.handle_request(envelope['request'],default_state_file=state_file,locked_state=True),ensure_ascii=False))

if __name__=='__main__':
    try: main()
    except Exception as exc:
        print(json.dumps({'jsonrpc':'2.0','id':1,'error':{'code':-32000,'message':str(exc)}})); sys.exit(1)
