import numpy as np
import skfuzzy as fuzz
from skfuzzy import control as ctrl

class UbiquitousRouter:
    def __init__(self):
        # --- Antecedents (Inputs) ---
        # User Experience: 0 (Novice) to 10 (Expert)
        self.user_exp = ctrl.Antecedent(np.arange(0, 11, 1), 'user_exp')
        
        # Latency Tolerance: 0.0 (Need Speed) to 1.0 (Can Wait/Opportunity)
        self.latency_tol = ctrl.Antecedent(np.arange(0, 1.1, 0.1), 'latency_tol')
        
        # Task Complexity: 0 (Simple/Reflex) to 10 (Deep/Creative)
        self.task_comp = ctrl.Antecedent(np.arange(0, 11, 1), 'task_comp')

        # --- Consequent (Output) ---
        # Route Score: 0 (Fast/Cheapest/Basic) to 100 (Premium/Deep/Complex)
        self.route_score = ctrl.Consequent(np.arange(0, 101, 1), 'route_score')

        # --- Membership Functions ---
        
        # User Exp: Poor (Novice), Average (Intermed), Good (Expert/Power)
        self.user_exp.automf(3)
        
        # Latency Tolerance: Poor (Urgent), Average, Good (Patient)
        self.latency_tol.automf(3)
        
        # Task Complexity: Poor (Simple), Average, Good (Complex)
        self.task_comp.automf(3)

        # Route Score Output
        self.route_score['basic'] = fuzz.trimf(self.route_score.universe, [0, 0, 50])
        self.route_score['balanced'] = fuzz.trimf(self.route_score.universe, [25, 50, 75])
        self.route_score['premium'] = fuzz.trimf(self.route_score.universe, [50, 100, 100])

        # --- Fuzzy Rules (The "Routing Ethos") ---
        
        # Rule 1: Novices or Urgent needs get Basic/Fast routes
        # Explanation: Don't overwhelm new users, don't delay urgent tasks.
        rule1 = ctrl.Rule(
            self.user_exp['poor'] | self.latency_tol['poor'] | self.task_comp['poor'], 
            self.route_score['basic']
        )
        
        # Rule 2: Average Case -> Balanced
        rule2 = ctrl.Rule(
            self.latency_tol['average'] & self.task_comp['average'], 
            self.route_score['balanced']
        )
        
        # Rule 3: Power Users with High Tolerance & Complex Tasks -> Premium
        # Explanation: "Latency as Opportunity" - they want the best result and can wait.
        rule3 = ctrl.Rule(
            self.user_exp['good'] & self.latency_tol['good'] & self.task_comp['good'], 
            self.route_score['premium']
        )

        # Additional nuance: Complex task but urgent -> Balanced (Compromise)
        rule4 = ctrl.Rule(
            self.task_comp['good'] & self.latency_tol['poor'], 
            self.route_score['balanced']
        )

        # --- System ---
        self.ctrl_system = ctrl.ControlSystem([rule1, rule2, rule3, rule4])
        self.simulation = ctrl.ControlSystemSimulation(self.ctrl_system)

    def route(self, user_exp: int, latency_tol: float, task_comp: int) -> dict:
        """
        Calculate the optimal Route Score.
        """
        try:
            self.simulation.input['user_exp'] = np.clip(user_exp, 0, 10)
            self.simulation.input['latency_tol'] = np.clip(latency_tol, 0, 1)
            self.simulation.input['task_comp'] = np.clip(task_comp, 0, 10)
            
            self.simulation.compute()
            score = float(self.simulation.output['route_score'])
            
            # Interpret the score into actionable decisions
            decision = "BASIC"
            if score > 75:
                decision = "PREMIUM"
            elif score > 40:
                decision = "BALANCED"
                
            return {
                "score": score,
                "strategy": decision,
                "reason": f"Exp:{user_exp}, Lat:{latency_tol}, Cmplx:{task_comp} -> {score:.1f}"
            }
            
        except Exception as e:
            print(f"Router ANFIS Error: {e}")
            return {"score": 0.0, "strategy": "BASIC", "error": str(e)}

# Global Instance
router = UbiquitousRouter()
