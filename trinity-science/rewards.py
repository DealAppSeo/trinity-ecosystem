import numpy as np
import skfuzzy as fuzz
from skfuzzy import control as ctrl

class AdaptiveRewardSystem:
    def __init__(self):
        # --- Antecedents (Inputs) ---
        # 0 to 1 scale
        self.network_need = ctrl.Antecedent(np.arange(0, 1.1, 0.1), 'network_need')
        self.saturation = ctrl.Antecedent(np.arange(0, 1.1, 0.1), 'saturation')
        self.diversity = ctrl.Antecedent(np.arange(0, 1.1, 0.1), 'diversity')

        # --- Consequent (Output) ---
        # Multiplier: 0.5x (Penalty) to 3.0x (Bonus)
        self.multiplier = ctrl.Consequent(np.arange(0.5, 3.1, 0.1), 'multiplier')

        # --- Membership Functions ---
        
        # Network Need: Low, Medium, High
        self.network_need.automf(3)
        
        # Saturation: Early (0.0-0.3), Mature (0.3-0.7), Saturated (0.7-1.0)
        self.saturation['early'] = fuzz.trimf(self.saturation.universe, [0, 0, 0.5])
        self.saturation['mature'] = fuzz.trimf(self.saturation.universe, [0.3, 0.5, 0.7])
        self.saturation['saturated'] = fuzz.trimf(self.saturation.universe, [0.5, 1, 1])

        # Diversity: Spammer (Low), Normal (Med), Renaissance (High)
        self.diversity['spammer'] = fuzz.trimf(self.diversity.universe, [0, 0, 0.4])
        self.diversity['normal'] = fuzz.trimf(self.diversity.universe, [0.2, 0.5, 0.8])
        self.diversity['renaissance'] = fuzz.trimf(self.diversity.universe, [0.6, 1, 1])

        # Multiplier Output
        self.multiplier['penalty'] = fuzz.trimf(self.multiplier.universe, [0.5, 0.5, 0.9])
        self.multiplier['standard'] = fuzz.trimf(self.multiplier.universe, [0.8, 1.0, 1.2])
        self.multiplier['boost'] = fuzz.trimf(self.multiplier.universe, [1.1, 1.5, 2.0])
        self.multiplier['jackpot'] = fuzz.trimf(self.multiplier.universe, [1.8, 3.0, 3.0])

        # --- Fuzzy Rules (The "User's Ethos") ---
        
        # Rule 1: Spammers get penalized regardless of context
        rule1 = ctrl.Rule(self.diversity['spammer'], self.multiplier['penalty'])
        
        # Rule 2: Early Birds get a boost
        rule2 = ctrl.Rule(self.saturation['early'] & self.diversity['normal'], self.multiplier['boost'])
        
        # Rule 3: Renaissance Humans in Early Network get Jackpot
        rule3 = ctrl.Rule(self.saturation['early'] & self.diversity['renaissance'], self.multiplier['jackpot'])
        
        # Rule 4: High Network Need boosts standard users
        rule4 = ctrl.Rule(self.network_need['high'] & self.diversity['normal'], self.multiplier['boost'])
        
        # Rule 5: Saturated Network returns to standard
        rule5 = ctrl.Rule(self.saturation['saturated'] & self.diversity['normal'], self.multiplier['standard'])

        # Rule 6: Renaissance User in Saturated Network still gets Boost (Loyalty)
        rule6 = ctrl.Rule(self.saturation['saturated'] & self.diversity['renaissance'], self.multiplier['boost'])

        # --- System ---
        self.ctrl_system = ctrl.ControlSystem([rule1, rule2, rule3, rule4, rule5, rule6])
        self.simulation = ctrl.ControlSystemSimulation(self.ctrl_system)

    def calculate(self, need_val: float, saturation_val: float, diversity_val: float) -> float:
        """
        Calculate Reward Multiplier.
        :param need_val: 0.0 (Low Need) to 1.0 (Critical Need)
        :param saturation_val: 0.0 (Empty) to 1.0 (Full/100M users)
        :param diversity_val: 0.0 (Bot) to 1.0 (Renaissance)
        """
        try:
            self.simulation.input['network_need'] = np.clip(need_val, 0, 1)
            self.simulation.input['saturation'] = np.clip(saturation_val, 0, 1)
            self.simulation.input['diversity'] = np.clip(diversity_val, 0, 1)
            
            self.simulation.compute()
            
            return float(self.simulation.output['multiplier'])
        except Exception as e:
            print(f"ANFIS Error: {e}")
            return 1.0 # Safe fallback

# Global singleton
reward_system = AdaptiveRewardSystem()
