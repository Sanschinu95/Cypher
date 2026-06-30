import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BehavioralCollector } from '@/lib/behavioralAuth';

interface BehavioralFormProps {
  collector: BehavioralCollector;
  onSubmit: (formData: any) => void;
  sessionNumber?: number;
  isTraining?: boolean;
}

export const BehavioralForm: React.FC<BehavioralFormProps> = ({
  collector,
  onSubmit,
  sessionNumber,
  isTraining = false
}) => {
  const [formData, setFormData] = useState({
    cardholderName: '',
    cardNumber: '',
    expiryDate: '',
    cvc: '',
    zipCode: ''
  });

  const formRef = useRef<HTMLFormElement>(null);
  const keyDownTimes = useRef<{ [key: string]: number }>({});

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      keyDownTimes.current[e.key] = Date.now();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const keyDown = keyDownTimes.current[e.key];
      if (keyDown) {
        const keyUp = Date.now();
        const pressure = (e as any).pressure || 0.5; // Some browsers support pressure
        collector.recordKeystroke(e.key, keyDown, keyUp, pressure);
        delete keyDownTimes.current[e.key];
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = form.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      collector.recordMouseMovement(x, y, 'move');
    };

    const handleMouseDown = (e: MouseEvent) => {
      const rect = form.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const eventType = e.button === 0 ? 'left_press' : 'right_press';
      collector.recordMouseMovement(x, y, eventType);
    };

    const handleMouseUp = (e: MouseEvent) => {
      const rect = form.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const eventType = e.button === 0 ? 'left_release' : 'right_release';
      collector.recordMouseMovement(x, y, eventType);
    };

    const handleWheel = (e: WheelEvent) => {
      const rect = form.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const eventType = e.deltaY < 0 ? 'scroll_up' : 'scroll_down';
      collector.recordMouseMovement(x, y, eventType);
    };

    const handleTouchStart = (e: TouchEvent) => {
      for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        const rect = form.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        const pressure = (touch as any).force || 0.5;
        const size = (touch as any).radiusX || 10;
        collector.recordTouchEvent(x, y, pressure, size, 'start');
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        const rect = form.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        const pressure = (touch as any).force || 0.5;
        const size = (touch as any).radiusX || 10;
        collector.recordTouchEvent(x, y, pressure, size, 'move');
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const rect = form.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        const pressure = (touch as any).force || 0.5;
        const size = (touch as any).radiusX || 10;
        collector.recordTouchEvent(x, y, pressure, size, 'end');
      }
    };

    form.addEventListener('keydown', handleKeyDown);
    form.addEventListener('keyup', handleKeyUp);
    form.addEventListener('mousemove', handleMouseMove);
    form.addEventListener('mousedown', handleMouseDown);
    form.addEventListener('mouseup', handleMouseUp);
    form.addEventListener('wheel', handleWheel);
    form.addEventListener('touchstart', handleTouchStart);
    form.addEventListener('touchmove', handleTouchMove);
    form.addEventListener('touchend', handleTouchEnd);

    return () => {
      form.removeEventListener('keydown', handleKeyDown);
      form.removeEventListener('keyup', handleKeyUp);
      form.removeEventListener('mousemove', handleMouseMove);
      form.removeEventListener('mousedown', handleMouseDown);
      form.removeEventListener('mouseup', handleMouseUp);
      form.removeEventListener('wheel', handleWheel);
      form.removeEventListener('touchstart', handleTouchStart);
      form.removeEventListener('touchmove', handleTouchMove);
      form.removeEventListener('touchend', handleTouchEnd);
    };
  }, [collector]);

  const handleInputChange = (field: string, value: string) => {
    let formattedValue = value;
    
    // Format card number with spaces
    if (field === 'cardNumber') {
      formattedValue = value.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
      if (formattedValue.length > 19) formattedValue = formattedValue.slice(0, 19);
    }
    
    // Format expiry date
    if (field === 'expiryDate') {
      formattedValue = value.replace(/\D/g, '').replace(/(\d{2})(\d)/, '$1/$2');
      if (formattedValue.length > 5) formattedValue = formattedValue.slice(0, 5);
    }
    
    // Format CVC (3-4 digits only)
    if (field === 'cvc') {
      formattedValue = value.replace(/\D/g, '').slice(0, 4);
    }
    
    // Format ZIP code (5 digits only)
    if (field === 'zipCode') {
      formattedValue = value.replace(/\D/g, '').slice(0, 5);
    }
    
    setFormData(prev => ({ ...prev, [field]: formattedValue }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <Card className="w-full max-w-2xl mx-auto bg-card border-border shadow-neural">
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl bg-gradient-primary bg-clip-text text-transparent">
          {isTraining ? `Training Session ${sessionNumber}/10` : 'Authentication Test'}
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          {isTraining 
            ? 'Fill out this form naturally to train the behavioral authentication system'
            : 'Fill out this form to test authentication against your behavioral patterns'
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="cardholderName" className="text-foreground font-medium">Cardholder Name</Label>
            <Input
              id="cardholderName"
              type="text"
              value={formData.cardholderName}
              onChange={(e) => handleInputChange('cardholderName', e.target.value)}
              placeholder="Alex Johnson"
              className="bg-input border-border focus:ring-primary transition-all duration-300 font-mono"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cardNumber" className="text-foreground font-medium">Card Number</Label>
            <Input
              id="cardNumber"
              type="text"
              value={formData.cardNumber}
              onChange={(e) => handleInputChange('cardNumber', e.target.value)}
              placeholder="4532 1508 2457 9123"
              className="bg-input border-border focus:ring-primary transition-all duration-300 font-mono text-lg tracking-wider"
              maxLength={19}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="expiryDate" className="text-foreground font-medium">Expiry Date</Label>
              <Input
                id="expiryDate"
                type="text"
                value={formData.expiryDate}
                onChange={(e) => handleInputChange('expiryDate', e.target.value)}
                placeholder="12/28"
                className="bg-input border-border focus:ring-primary transition-all duration-300 font-mono"
                maxLength={5}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cvc" className="text-foreground font-medium">CVC</Label>
              <Input
                id="cvc"
                type="text"
                value={formData.cvc}
                onChange={(e) => handleInputChange('cvc', e.target.value)}
                placeholder="456"
                className="bg-input border-border focus:ring-primary transition-all duration-300 font-mono"
                maxLength={4}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="zipCode" className="text-foreground font-medium">ZIP Code</Label>
            <Input
              id="zipCode"
              type="text"
              value={formData.zipCode}
              onChange={(e) => handleInputChange('zipCode', e.target.value)}
              placeholder="12345"
              className="bg-input border-border focus:ring-primary transition-all duration-300 font-mono"
              maxLength={5}
              required
            />
          </div>

          <Button 
            type="submit" 
            className="w-full bg-gradient-primary hover:opacity-90 text-primary-foreground font-semibold py-3 transition-all duration-300 shadow-glow"
          >
            {isTraining ? 'Complete Training Session' : 'Submit for Authentication'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};