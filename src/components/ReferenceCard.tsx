import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CreditCard, Cpu } from 'lucide-react';

export const ReferenceCard: React.FC = () => {
  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold text-foreground mb-2">Reference Test Card</h3>
        <p className="text-sm text-muted-foreground">Use these details for consistent testing</p>
      </div>
      
      <div className="relative">
        {/* Credit Card Front */}
        <Card className="bg-gradient-cyber border-0 shadow-glow overflow-hidden relative h-56 w-full">
          <CardContent className="p-6 h-full flex flex-col justify-between text-white relative">
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-20">
              <div className="absolute top-4 right-4 w-32 h-32 rounded-full border-2 border-white/30"></div>
              <div className="absolute bottom-4 left-4 w-24 h-24 rounded-full border-2 border-white/20"></div>
            </div>
            
            {/* Card Header */}
            <div className="flex justify-between items-start relative z-10">
              <div className="flex items-center gap-2">
                <Cpu className="h-8 w-8 text-white" />
                <div className="text-xs font-medium">CHIP</div>
              </div>
              <CreditCard className="h-8 w-8 text-white" />
            </div>
            
            {/* Card Number */}
            <div className="relative z-10">
              <div className="text-2xl font-mono tracking-wider mb-4 font-bold">
                4532 1508 2457 9123
              </div>
            </div>
            
            {/* Card Bottom */}
            <div className="flex justify-between items-end relative z-10">
              <div>
                <div className="text-xs text-white/80 mb-1">CARDHOLDER NAME</div>
                <div className="text-lg font-semibold">ALEX JOHNSON</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-white/80 mb-1">EXPIRES</div>
                <div className="text-lg font-semibold">12/28</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Card Brand */}
        <div className="absolute top-4 right-6 text-white font-bold text-lg z-20">
          VISA
        </div>
      </div>
      
      {/* Additional Details */}
      <div className="mt-4 p-4 bg-card border border-border rounded-lg">
        <h4 className="font-semibold text-foreground mb-3 text-center">Test Details</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Card Type:</span>
            <span className="text-foreground font-medium">Visa</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">CVC:</span>
            <span className="text-foreground font-medium font-mono">456</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">ZIP Code:</span>
            <span className="text-foreground font-medium">12345</span>
          </div>
        </div>
      </div>
    </div>
  );
};