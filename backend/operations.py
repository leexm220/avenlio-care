"""Operator-entered coordination records; no automatic bookings or clinical decisions."""
from datetime import date
import math
import re

TASKS=('materials','hospital','agreement','travel','visit','discharge','followup')

def empty_coordination():
    return dict(tasks={key:False for key in TASKS},next_action='',next_action_on='',
        hospital_state='not_requested',hospital_id='',appointment_on='',appointment_time='',
        campus='',confirmation_reference='',service_quote_usd=None,quote_scope='')

def validate_coordination(value,catalog,previous=None):
    if not isinstance(value,dict):raise ValueError('Coordination plan must be an object')
    clean=empty_coordination()
    if set(value)-set(clean):raise ValueError('Unknown coordination field')
    tasks=value.get('tasks',{})
    if not isinstance(tasks,dict) or set(tasks)-set(TASKS) or any(not isinstance(v,bool) for v in tasks.values()):
        raise ValueError('Invalid coordination checklist')
    clean['tasks'].update(tasks)
    for key,maximum in [('next_action',500),('next_action_on',10),('hospital_id',80),('appointment_on',10),
                        ('appointment_time',5),('campus',300),('confirmation_reference',1000),('quote_scope',2000)]:
        raw=value.get(key,'')
        if not isinstance(raw,str) or len(raw)>maximum:raise ValueError('Invalid coordination field: '+key)
        clean[key]=raw.strip()
    for key in ('next_action_on','appointment_on'):
        if clean[key] and date.fromisoformat(clean[key]).isoformat()!=clean[key]:raise ValueError('Use YYYY-MM-DD for '+key)
    if clean['appointment_time'] and not re.fullmatch(r'(?:[01][0-9]|2[0-3]):[0-5][0-9]',clean['appointment_time']):
        raise ValueError('Appointment time must be HH:MM in Beijing time')
    state=value.get('hospital_state','not_requested')
    if state not in ('not_requested','requested','confirmed','unavailable'):raise ValueError('Invalid hospital confirmation state')
    clean['hospital_state']=state
    if clean['hospital_id'] and clean['hospital_id'] not in {h['id'] for h in catalog['hospitals']}:
        raise ValueError('Select a hospital in the maintained directory')
    if state=='confirmed' and any(not clean[key] for key in ('hospital_id','appointment_on','appointment_time','campus','confirmation_reference')):
        raise ValueError('Confirmed appointments require a hospital, date, Beijing time, campus and confirmation reference')
    amount=value.get('service_quote_usd')
    if amount is not None:
        if isinstance(amount,bool) or not isinstance(amount,(int,float)) or not math.isfinite(amount) or amount<=0 or round(amount,2)!=amount:
            raise ValueError('Invalid service quote amount')
        fee=catalog['service_config']
        if amount!=(previous or {}).get('service_quote_usd') and not fee.get('service_fee_min',fee['service_fee'])<=amount<=fee['service_fee']:
            raise ValueError('Service quote must be within the configured service fee range')
        if not clean['quote_scope']:raise ValueError('A service quote requires a written scope reference')
        clean['service_quote_usd']=amount
    return clean
